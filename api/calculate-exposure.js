/**
 * Vercel Serverless Function
 * Route: POST /api/calculate-exposure
 *
 * Receives:
 * - filterStatus
 * - commodity
 * - siteOrOrigin
 * - asOfDate
 * - physicalPositions
 * - hedgePositions
 * - riskLimits
 *
 * Returns:
 * - snapshotRows
 * - agentMessage
 * - summary
 */

module.exports = async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    const body = req.body || {};

    const physicalPositions = ensureArray(body.physicalPositions);
    const hedgePositions = ensureArray(body.hedgePositions);
    const riskLimits = ensureArray(body.riskLimits);

    const requestedCommodity = cleanText(body.commodity);
    const requestedSite = cleanText(body.siteOrOrigin);

    const asOfDate = cleanText(body.asOfDate) || "2026-07-22";

    /*
     * Do not blindly trust Power Automate.
     * Derive the status again to prevent mismatched input.
     */
    const filterStatus = deriveFilterStatus(
      requestedCommodity,
      requestedSite
    );

    // Validate supplied FilterStatus, but use derived status as truth.
    const suppliedFilterStatus = cleanText(body.filterStatus).toUpperCase();

    const warnings = [];

    if (
      suppliedFilterStatus &&
      suppliedFilterStatus !== filterStatus
    ) {
      warnings.push(
        `Supplied filterStatus "${suppliedFilterStatus}" did not match the inputs. ` +
          `The API used "${filterStatus}".`
      );
    }

    /*
     * Normalize SharePoint rows.
     * This also supports payloads where SharePoint fields are nested
     * inside a "fields" object.
     */
    const normalizedPhysical = physicalPositions.map(unwrapSharePointRow);
    const normalizedHedges = hedgePositions.map(unwrapSharePointRow);
    const normalizedLimits = riskLimits.map(unwrapSharePointRow);

    /*
     * Guide logic:
     * Only use NetExposure limits.
     */
    const netExposureLimits = normalizedLimits.filter((row) => {
      const limitType = cleanText(
        getValue(row, ["LimitType", "limitType"])
      );

      return (
        !limitType ||
        normalize(limitType) === normalize("NetExposure")
      );
    });

    /*
     * Create all valid commodity/site combinations dynamically.
     *
     * Physical uses:
     * - Commodity
     * - SiteOrOrigin
     *
     * Hedge uses:
     * - Commodity
     * - LinkedSite
     *
     * Limit uses:
     * - Commodity
     * - SiteOrOrigin
     */
    const keys = buildExposureKeys({
      physicalPositions: normalizedPhysical,
      hedgePositions: normalizedHedges,
      riskLimits: netExposureLimits,
    });

    const selectedKeys = keys.filter((key) =>
      keyMatchesRequest({
        key,
        filterStatus,
        requestedCommodity,
        requestedSite,
      })
    );

    const snapshotRows = [];

    for (const key of selectedKeys) {
      const physicalRows = normalizedPhysical.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getPhysicalSite(row), key.siteOrOrigin) &&
          matchesAsOfDate(row, asOfDate)
        );
      });

      const hedgeRows = normalizedHedges.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getHedgeSite(row), key.siteOrOrigin) &&
          matchesAsOfDate(row, asOfDate)
        );
      });

      const matchingLimits = netExposureLimits.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getLimitSite(row), key.siteOrOrigin) &&
          matchesAsOfDate(row, asOfDate, true)
        );
      });

      const physicalMT = roundNumber(
        sumNumericField(physicalRows, [
          "VolumeMT",
          "PhysicalMT",
          "QuantityMT",
          "Volume",
        ]),
        2
      );

      const hedgeMT = roundNumber(
        sumNumericField(hedgeRows, [
          "VolumeMT",
          "HedgeMT",
          "HedgeVolumeMT",
          "QuantityMT",
          "Volume",
        ]),
        2
      );

      /*
       * Guide formula:
       * Hedges are already stored as negative values.
       */
      const netMT = roundNumber(physicalMT + hedgeMT, 2);
      const absNet = Math.abs(netMT);

      const limitRow = matchingLimits[0] || null;

      const limitAmount = limitRow
        ? roundNumber(
            toNumber(
              getValue(limitRow, [
                "LimitAmount",
                "LimitMT",
                "ExposureLimitMT",
                "MaxExposureMT",
              ])
            ),
            2
          )
        : 0;

      let utilizationPct = null;
      let status = "NO_LIMIT";

      if (limitAmount > 0) {
        utilizationPct = roundNumber(
          (absNet / Math.abs(limitAmount)) * 100,
          1
        );

        status = calculateStatus(utilizationPct);
      }

      snapshotRows.push({
        asOfDate,
        commodity: key.commodity,
        siteOrOrigin: key.siteOrOrigin,

        physicalMT,
        hedgeMT,
        netMT,
        absNet,

        netMTM: roundNumber(
          sumNumericField(
            [...physicalRows, ...hedgeRows],
            ["MTMValue", "NetMTM"]
          ),
          2
        ),

        limitType: "NetExposure",
        limitAmount,
        utilizationPct,
        status,

        sourceCounts: {
          physicalRows: physicalRows.length,
          hedgeRows: hedgeRows.length,
          limitRows: matchingLimits.length,
        },
      });
    }

    /*
     * Demo DailyLoss row from the guide.
     *
     * Include it when:
     * - ALL was requested, or
     * - the user selected RawSugar/Egypt.
     *
     * This is kept separate because it is a demo policy row,
     * not a Physical + Hedge calculation.
     */
    if (
      shouldIncludeEgyptDailyLoss({
        filterStatus,
        requestedCommodity,
        requestedSite,
      })
    ) {
      snapshotRows.push({
        asOfDate,
        commodity: "RawSugar",
        siteOrOrigin: "Egypt_DailyLoss",

        physicalMT: 0,
        hedgeMT: 0,
        netMT: 0,
        absNet: 0,

        netMTM: 460000,
        limitType: "DailyLoss",
        limitAmount: 500000,
        utilizationPct: 92,
        status: "Watch",

        sourceCounts: {
          physicalRows: 0,
          hedgeRows: 0,
          limitRows: 0,
        },

        isDemoPolicyRow: true,
      });
    }

    const sortedRows = sortSnapshotRows(snapshotRows);

    const agentMessage = buildAgentMessage({
      rows: sortedRows,
      asOfDate,
      filterStatus,
      requestedCommodity,
      requestedSite,
    });

    return res.status(200).json({
      success: true,

      request: {
        suppliedFilterStatus: suppliedFilterStatus || null,
        filterStatus,
        commodity: requestedCommodity || null,
        siteOrOrigin: requestedSite || null,
        asOfDate,
      },

      inputCounts: {
        physicalPositions: normalizedPhysical.length,
        hedgePositions: normalizedHedges.length,
        riskLimits: normalizedLimits.length,
      },

      summary: {
        exposureRows: sortedRows.filter(
          (row) => !row.isDemoPolicyRow
        ).length,

        totalRows: sortedRows.length,

        okCount: sortedRows.filter(
          (row) => row.status === "OK"
        ).length,

        watchCount: sortedRows.filter(
          (row) => row.status === "Watch"
        ).length,

        breachCount: sortedRows.filter(
          (row) => row.status === "Breach"
        ).length,

        noLimitCount: sortedRows.filter(
          (row) => row.status === "NO_LIMIT"
        ).length,
      },

      snapshotRows: sortedRows,
      agentMessage,
      warnings,
    });
  } catch (error) {
    console.error("Exposure calculation failed:", error);

    return res.status(400).json({
      success: false,
      error: error.message || "Exposure calculation failed.",
    });
  }
};

/* =========================================================
   Helpers
   ========================================================= */

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  /*
   * Also support SharePoint/Get items object:
   * { value: [...] }
   */
  if (value && Array.isArray(value.value)) {
    return value.value;
  }

  return [];
}

function unwrapSharePointRow(row) {
  if (!row || typeof row !== "object") {
    return {};
  }

  if (
    row.fields &&
    typeof row.fields === "object" &&
    !Array.isArray(row.fields)
  ) {
    return {
      ...row,
      ...row.fields,
    };
  }

  return row;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function sameText(left, right) {
  return normalize(left) === normalize(right);
}

function getValue(row, possibleNames) {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  for (const name of possibleNames) {
    if (
      Object.prototype.hasOwnProperty.call(row, name) &&
      row[name] !== null &&
      row[name] !== undefined
    ) {
      return row[name];
    }
  }

  /*
   * Case-insensitive fallback.
   */
  const rowKeys = Object.keys(row);

  for (const expectedName of possibleNames) {
    const matchingKey = rowKeys.find(
      (key) => normalize(key) === normalize(expectedName)
    );

    if (
      matchingKey &&
      row[matchingKey] !== null &&
      row[matchingKey] !== undefined
    ) {
      return row[matchingKey];
    }
  }

  return undefined;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}

function roundNumber(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function sumNumericField(rows, possibleFields) {
  return rows.reduce((total, row) => {
    const value = getValue(row, possibleFields);
    return total + toNumber(value);
  }, 0);
}

function getCommodity(row) {
  return cleanText(
    getValue(row, [
      "Commodity",
      "CommodityName",
      "commodity",
    ])
  );
}

function getPhysicalSite(row) {
  return cleanText(
    getValue(row, [
      "SiteOrOrigin",
      "OriginOrSite",
      "Site",
      "Location",
    ])
  );
}

function getHedgeSite(row) {
  return cleanText(
    getValue(row, [
      "LinkedSite",
      "SiteOrOrigin",
      "OriginOrSite",
      "Site",
      "Location",
    ])
  );
}

function getLimitSite(row) {
  return cleanText(
    getValue(row, [
      "SiteOrOrigin",
      "LinkedSite",
      "OriginOrSite",
      "Site",
      "Location",
    ])
  );
}

function getRowDate(row) {
  return cleanText(
    getValue(row, [
      "AsOfDate",
      "TradeDate",
      "Date",
      "SnapshotDate",
    ])
  );
}

function normalizeDate(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  /*
   * Handles:
   * 2026-07-22
   * 2026-07-22T00:00:00Z
   */
  return text.substring(0, 10);
}

function matchesAsOfDate(row, asOfDate, allowMissingDate = false) {
  const rowDate = normalizeDate(getRowDate(row));
  const requestedDate = normalizeDate(asOfDate);

  if (!rowDate) {
    return allowMissingDate || true;
  }

  if (!requestedDate) {
    return true;
  }

  return rowDate === requestedDate;
}

function deriveFilterStatus(commodity, siteOrOrigin) {
  const hasCommodity = Boolean(cleanText(commodity));
  const hasSite = Boolean(cleanText(siteOrOrigin));

  if (!hasCommodity && !hasSite) {
    return "ALL";
  }

  if (hasCommodity && !hasSite) {
    return "COMMODITY_ONLY";
  }

  if (!hasCommodity && hasSite) {
    return "SITE_ONLY";
  }

  return "COMMODITY_AND_SITE";
}

function buildExposureKeys({
  physicalPositions,
  hedgePositions,
  riskLimits,
}) {
  const keyMap = new Map();

  const addKey = (commodity, siteOrOrigin) => {
    const cleanCommodity = cleanText(commodity);
    const cleanSite = cleanText(siteOrOrigin);

    if (!cleanCommodity || !cleanSite) {
      return;
    }

    const mapKey =
      `${normalize(cleanCommodity)}|${normalize(cleanSite)}`;

    if (!keyMap.has(mapKey)) {
      keyMap.set(mapKey, {
        commodity: cleanCommodity,
        siteOrOrigin: cleanSite,
      });
    }
  };

  for (const row of physicalPositions) {
    addKey(getCommodity(row), getPhysicalSite(row));
  }

  for (const row of hedgePositions) {
    addKey(getCommodity(row), getHedgeSite(row));
  }

  for (const row of riskLimits) {
    addKey(getCommodity(row), getLimitSite(row));
  }

  return Array.from(keyMap.values());
}

function keyMatchesRequest({
  key,
  filterStatus,
  requestedCommodity,
  requestedSite,
}) {
  switch (filterStatus) {
    case "ALL":
      return true;

    case "COMMODITY_ONLY":
      return sameText(key.commodity, requestedCommodity);

    case "SITE_ONLY":
      return sameText(key.siteOrOrigin, requestedSite);

    case "COMMODITY_AND_SITE":
      return (
        sameText(key.commodity, requestedCommodity) &&
        sameText(key.siteOrOrigin, requestedSite)
      );

    default:
      return false;
  }
}

function calculateStatus(utilizationPct) {
  const utilization = toNumber(utilizationPct);

  if (utilization >= 100) {
    return "Breach";
  }

  if (utilization >= 70) {
    return "Watch";
  }

  return "OK";
}

function shouldIncludeEgyptDailyLoss({
  filterStatus,
  requestedCommodity,
  requestedSite,
}) {
  if (filterStatus === "ALL") {
    return true;
  }

  if (filterStatus === "COMMODITY_ONLY") {
    return sameText(requestedCommodity, "RawSugar");
  }

  if (filterStatus === "SITE_ONLY") {
    return sameText(requestedSite, "Egypt");
  }

  return (
    sameText(requestedCommodity, "RawSugar") &&
    sameText(requestedSite, "Egypt")
  );
}

function sortSnapshotRows(rows) {
  const statusOrder = {
    Breach: 1,
    Watch: 2,
    OK: 3,
    NO_LIMIT: 4,
  };

  return [...rows].sort((a, b) => {
    const statusDifference =
      (statusOrder[a.status] || 99) -
      (statusOrder[b.status] || 99);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const commodityDifference = cleanText(
      a.commodity
    ).localeCompare(cleanText(b.commodity));

    if (commodityDifference !== 0) {
      return commodityDifference;
    }

    return cleanText(a.siteOrOrigin).localeCompare(
      cleanText(b.siteOrOrigin)
    );
  });
}

function buildAgentMessage({
  rows,
  asOfDate,
  filterStatus,
  requestedCommodity,
  requestedSite,
}) {
  const selectionParts = [];

  if (requestedCommodity) {
    selectionParts.push(`Commodity: ${requestedCommodity}`);
  }

  if (requestedSite) {
    selectionParts.push(`Site/Origin: ${requestedSite}`);
  }

  const selectionText =
    selectionParts.length > 0
      ? selectionParts.join(" | ")
      : "All commodities and sites";

  if (rows.length === 0) {
    return [
      "Exposure Snapshot Results",
      `As of: ${asOfDate}`,
      `Filter: ${filterStatus}`,
      `Selection: ${selectionText}`,
      "",
      "No matching exposure data was found.",
    ].join("\n");
  }

  const detailLines = rows.map((row) => {
    if (row.isDemoPolicyRow) {
      return (
        `${row.commodity} ${row.siteOrOrigin}: ` +
        `Daily Loss ${formatNumber(row.netMTM)} | ` +
        `Util ${formatNumber(row.utilizationPct)}% | ` +
        `${row.status}`
      );
    }

    const utilization =
      row.utilizationPct === null
        ? "No limit"
        : `${formatNumber(row.utilizationPct)}%`;

    return (
      `${row.commodity} ${row.siteOrOrigin}: ` +
      `Physical ${formatNumber(row.physicalMT)} MT | ` +
      `Hedge ${formatNumber(row.hedgeMT)} MT | ` +
      `Net ${formatNumber(row.netMT)} MT | ` +
      `Limit ${formatNumber(row.limitAmount)} | ` +
      `Util ${utilization} | ` +
      `${row.status}`
    );
  });

  const watchCount = rows.filter(
    (row) => row.status === "Watch"
  ).length;

  const breachCount = rows.filter(
    (row) => row.status === "Breach"
  ).length;

  return [
    "Exposure Snapshot Results",
    `As of: ${asOfDate}`,
    `Filter: ${filterStatus}`,
    `Selection: ${selectionText}`,
    `Rows: ${rows.length} | Watch: ${watchCount} | Breach: ${breachCount}`,
    "",
    ...detailLines,
  ].join("\n");
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}
