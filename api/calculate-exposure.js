/**
 * CRC Exposure Calculation API
 * POST /api/calculate-exposure
 *
 * Power Automate sends:
 * {
 *   commodity: string | null,
 *   siteOrOrigin: string | null,
 *   physicalPositions: [],
 *   hedgePositions: [],
 *   riskLimits: []
 * }
 */

module.exports = async function handler(req, res) {
  // Response headers only.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    const body = req.body || {};

    const selectedCommodity = cleanText(body.commodity);
    const selectedSiteOrOrigin = cleanText(body.siteOrOrigin);

    const physicalPositions = normalizeRows(body.physicalPositions);
    const hedgePositions = normalizeRows(body.hedgePositions);
    const riskLimits = normalizeRows(body.riskLimits);

    /*
     * The API determines the filter case.
     * Power Automate no longer needs Conditions.
     */
    const filterStatus = deriveFilterStatus(
      selectedCommodity,
      selectedSiteOrOrigin
    );

    /*
     * Only use NetExposure limits.
     * If LimitType is missing, keep the row for compatibility.
     */
    const netExposureLimits = riskLimits.filter((row) => {
      const limitType = cleanText(
        getField(row, ["LimitType", "limitType"])
      );

      return (
        !limitType ||
        sameText(limitType, "NetExposure")
      );
    });

    /*
     * Build commodity/site combinations dynamically from all three lists.
     */
    const exposureKeys = buildExposureKeys({
      physicalPositions,
      hedgePositions,
      riskLimits: netExposureLimits,
    });

    /*
     * Apply the requested Commodity/Site filter.
     */
    const selectedKeys = exposureKeys.filter((key) =>
      keyMatchesSelection({
        key,
        filterStatus,
        selectedCommodity,
        selectedSiteOrOrigin,
      })
    );

    const snapshotRows = selectedKeys.map((key) => {
      /*
       * Physical Positions:
       * Commodity + SiteOrOrigin
       */
      const matchingPhysicalRows = physicalPositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getPhysicalSite(row), key.siteOrOrigin)
        );
      });

      /*
       * Hedge Positions:
       * Commodity + LinkedSite
       */
      const matchingHedgeRows = hedgePositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getHedgeSite(row), key.siteOrOrigin)
        );
      });

      /*
       * Risk Limits:
       * Commodity + SiteOrOrigin + NetExposure
       */
      const matchingLimitRows = netExposureLimits.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getLimitSite(row), key.siteOrOrigin)
        );
      });

      const physicalMT = round(
        sumRows(matchingPhysicalRows, [
          "VolumeMT",
          "PhysicalMT",
          "QuantityMT",
          "Volume",
        ]),
        2
      );

      const hedgeMT = round(
        sumRows(matchingHedgeRows, [
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
       * Hedge volumes are already negative.
       */
      const netMT = round(physicalMT + hedgeMT, 2);
      const absNetMT = Math.abs(netMT);

      const limitRow = matchingLimitRows[0] || null;

      const limitAmount = limitRow
        ? round(
            toNumber(
              getField(limitRow, [
                "LimitAmount",
                "LimitMT",
                "ExposureLimitMT",
                "MaxExposureMT",
              ])
            ),
            2
          )
        : 0;

      const utilizationPct =
        limitAmount > 0
          ? round((absNetMT / Math.abs(limitAmount)) * 100, 1)
          : null;

      const status =
        utilizationPct === null
          ? "NO_LIMIT"
          : calculateStatus(utilizationPct);

      const physicalMTM = sumRows(matchingPhysicalRows, [
        "MTMValue",
        "NetMTM",
      ]);

      const hedgeMTM = sumRows(matchingHedgeRows, [
        "MTMValue",
        "NetMTM",
      ]);

      return {
        commodity: key.commodity,
        siteOrOrigin: key.siteOrOrigin,

        physicalMT,
        hedgeMT,
        netMT,
        absNetMT,

        netMTM: round(physicalMTM + hedgeMTM, 2),

        limitType: "NetExposure",
        limitAmount,
        utilizationPct,
        status,

        sourceCounts: {
          physicalRows: matchingPhysicalRows.length,
          hedgeRows: matchingHedgeRows.length,
          limitRows: matchingLimitRows.length,
        },
      };
    });

    const sortedRows = sortRows(snapshotRows);

    const summary = {
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
    };

    const agentMessage = buildAgentMessage({
      filterStatus,
      selectedCommodity,
      selectedSiteOrOrigin,
      rows: sortedRows,
      summary,
    });

    return res.status(200).json({
      success: true,

      request: {
        filterStatus,
        commodity: selectedCommodity || null,
        siteOrOrigin: selectedSiteOrOrigin || null,
      },

      inputCounts: {
        physicalPositions: physicalPositions.length,
        hedgePositions: hedgePositions.length,
        riskLimits: riskLimits.length,
      },

      summary,
      snapshotRows: sortedRows,
      agentMessage,
    });
  } catch (error) {
    console.error("Exposure calculation failed:", error);

    return res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Exposure calculation failed.",
    });
  }
};

/* =========================================================
   Input normalization
   ========================================================= */

function normalizeRows(input) {
  let rows = [];

  if (Array.isArray(input)) {
    rows = input;
  } else if (input && Array.isArray(input.value)) {
    rows = input.value;
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      return {};
    }

    /*
     * Supports payloads where SharePoint fields
     * are inside a nested fields object.
     */
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
  });
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function getField(row, possibleNames) {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  /*
   * Exact field-name match.
   */
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
   * Case/spacing-insensitive fallback.
   */
  const rowKeys = Object.keys(row);

  for (const expectedName of possibleNames) {
    const matchingKey = rowKeys.find(
      (key) =>
        normalizeText(key) === normalizeText(expectedName)
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

/* =========================================================
   SharePoint field mappings
   ========================================================= */

function getCommodity(row) {
  return cleanText(
    getField(row, [
      "Commodity",
      "CommodityName",
    ])
  );
}

function getPhysicalSite(row) {
  return cleanText(
    getField(row, [
      "SiteOrOrigin",
      "OriginOrSite",
      "Site",
      "Location",
    ])
  );
}

function getHedgeSite(row) {
  return cleanText(
    getField(row, [
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
    getField(row, [
      "SiteOrOrigin",
      "LinkedSite",
      "OriginOrSite",
      "Site",
      "Location",
    ])
  );
}

/* =========================================================
   Filter logic
   ========================================================= */

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

function keyMatchesSelection({
  key,
  filterStatus,
  selectedCommodity,
  selectedSiteOrOrigin,
}) {
  switch (filterStatus) {
    case "ALL":
      return true;

    case "COMMODITY_ONLY":
      return sameText(
        key.commodity,
        selectedCommodity
      );

    case "SITE_ONLY":
      return sameText(
        key.siteOrOrigin,
        selectedSiteOrOrigin
      );

    case "COMMODITY_AND_SITE":
      return (
        sameText(key.commodity, selectedCommodity) &&
        sameText(
          key.siteOrOrigin,
          selectedSiteOrOrigin
        )
      );

    default:
      return false;
  }
}

/* =========================================================
   Exposure keys
   ========================================================= */

function buildExposureKeys({
  physicalPositions,
  hedgePositions,
  riskLimits,
}) {
  const keyMap = new Map();

  function addKey(commodity, siteOrOrigin) {
    const cleanCommodity = cleanText(commodity);
    const cleanSite = cleanText(siteOrOrigin);

    if (!cleanCommodity || !cleanSite) {
      return;
    }

    const key =
      `${normalizeText(cleanCommodity)}|` +
      `${normalizeText(cleanSite)}`;

    if (!keyMap.has(key)) {
      keyMap.set(key, {
        commodity: cleanCommodity,
        siteOrOrigin: cleanSite,
      });
    }
  }

  physicalPositions.forEach((row) => {
    addKey(
      getCommodity(row),
      getPhysicalSite(row)
    );
  });

  hedgePositions.forEach((row) => {
    addKey(
      getCommodity(row),
      getHedgeSite(row)
    );
  });

  riskLimits.forEach((row) => {
    addKey(
      getCommodity(row),
      getLimitSite(row)
    );
  });

  return Array.from(keyMap.values());
}

/* =========================================================
   Calculations
   ========================================================= */

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function sumRows(rows, possibleFields) {
  return rows.reduce((total, row) => {
    return (
      total +
      toNumber(getField(row, possibleFields))
    );
  }, 0);
}

function round(value, decimalPlaces = 2) {
  const factor = 10 ** decimalPlaces;

  return (
    Math.round(
      (toNumber(value) + Number.EPSILON) * factor
    ) / factor
  );
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

/* =========================================================
   Response formatting
   ========================================================= */

function sortRows(rows) {
  const statusPriority = {
    Breach: 1,
    Watch: 2,
    OK: 3,
    NO_LIMIT: 4,
  };

  return [...rows].sort((left, right) => {
    const statusDifference =
      (statusPriority[left.status] || 99) -
      (statusPriority[right.status] || 99);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const commodityDifference =
      cleanText(left.commodity).localeCompare(
        cleanText(right.commodity)
      );

    if (commodityDifference !== 0) {
      return commodityDifference;
    }

    return cleanText(
      left.siteOrOrigin
    ).localeCompare(
      cleanText(right.siteOrOrigin)
    );
  });
}

function buildAgentMessage({
  filterStatus,
  selectedCommodity,
  selectedSiteOrOrigin,
  rows,
  summary,
}) {
  const selection = [];

  if (selectedCommodity) {
    selection.push(
      `Commodity: ${selectedCommodity}`
    );
  }

  if (selectedSiteOrOrigin) {
    selection.push(
      `Site/Origin: ${selectedSiteOrOrigin}`
    );
  }

  const selectionText =
    selection.length > 0
      ? selection.join(" | ")
      : "All commodities and sites";

  if (rows.length === 0) {
    return [
      "Exposure Snapshot Results",
      `Filter: ${filterStatus}`,
      `Selection: ${selectionText}`,
      "",
      "No matching exposure data was found.",
    ].join("\n");
  }

  const detailLines = rows.map((row) => {
    const utilizationText =
      row.utilizationPct === null
        ? "No limit"
        : `${formatNumber(row.utilizationPct)}%`;

    return (
      `${row.commodity} ${row.siteOrOrigin}: ` +
      `Physical ${formatNumber(row.physicalMT)} MT | ` +
      `Hedge ${formatNumber(row.hedgeMT)} MT | ` +
      `Net ${formatNumber(row.netMT)} MT | ` +
      `Limit ${formatNumber(row.limitAmount)} | ` +
      `Util ${utilizationText} | ` +
      `${row.status}`
    );
  });

  return [
    "Exposure Snapshot Results",
    `Filter: ${filterStatus}`,
    `Selection: ${selectionText}`,
    `Rows: ${summary.totalRows}`,
    `Watch: ${summary.watchCount}`,
    `Breach: ${summary.breachCount}`,
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
