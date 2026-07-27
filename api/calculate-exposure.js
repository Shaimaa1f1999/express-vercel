/**
 * CRC Exposure Calculation API
 *
 * Route:
 * POST /api/calculate-exposure
 *
 * Expected request body:
 * {
 *   "commodity": "RawSugar",
 *   "siteOrOrigin": "Jeddah",
 *   "physicalPositions": [],
 *   "hedgePositions": [],
 *   "riskLimits": []
 * }
 */

module.exports = async function handler(req, res) {
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

    const selectedCommodity = extractTextValue(body.commodity);
    const selectedSiteOrOrigin = extractTextValue(body.siteOrOrigin);

    const physicalPositions = normalizeRows(body.physicalPositions);
    const hedgePositions = normalizeRows(body.hedgePositions);
    const riskLimits = normalizeRows(body.riskLimits);

    const filterStatus = deriveFilterStatus(
      selectedCommodity,
      selectedSiteOrOrigin
    );

    /*
     * Keep only NetExposure limits.
     * Rows without LimitType are retained for compatibility.
     */
    const netExposureLimits = riskLimits.filter((row) => {
      const limitType = extractTextValue(
        getField(row, [
          "LimitType",
          "Limit Type",
          "Limit_x0020_Type",
          "limitType",
        ])
      );

      return !limitType || sameText(limitType, "NetExposure");
    });

    /*
     * Build available Commodity + Site combinations dynamically.
     */
    const exposureKeys = buildExposureKeys({
      physicalPositions,
      hedgePositions,
      riskLimits: netExposureLimits,
    });

    /*
     * Apply user filters:
     * - Both empty: all
     * - Commodity only
     * - Site only
     * - Commodity and site
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
       * Physical:
       * Commodity + SiteOrOrigin
       */
      const matchingPhysicalRows = physicalPositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getPhysicalSite(row), key.siteOrOrigin)
        );
      });

      /*
       * Hedges:
       * Commodity + LinkedSite
       */
      const matchingHedgeRows = hedgePositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getHedgeSite(row), key.siteOrOrigin)
        );
      });

      /*
       * Limits:
       * Commodity + SiteOrOrigin
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
          "Volume MT",
          "Volume_x0020_MT",
          "PhysicalMT",
          "Physical MT",
          "QuantityMT",
          "Quantity MT",
          "Volume",
        ]),
        2
      );

      const hedgeMT = round(
        sumRows(matchingHedgeRows, [
          "VolumeMT",
          "Volume MT",
          "Volume_x0020_MT",
          "HedgeMT",
          "Hedge MT",
          "HedgeVolumeMT",
          "Hedge Volume MT",
          "QuantityMT",
          "Quantity MT",
          "Volume",
        ]),
        2
      );

      /*
       * Hedge values are already negative.
       */
      const netMT = round(physicalMT + hedgeMT, 2);
      const absNetMT = Math.abs(netMT);

      const limitRow = matchingLimitRows[0] || null;

      const limitAmount = limitRow
        ? round(
            toNumber(
              getField(limitRow, [
                "LimitAmount",
                "Limit Amount",
                "Limit_x0020_Amount",
                "LimitMT",
                "Limit MT",
                "ExposureLimitMT",
                "Exposure Limit MT",
                "MaxExposureMT",
                "Max Exposure MT",
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
        "MTM Value",
        "MTM_x0020_Value",
        "NetMTM",
        "Net MTM",
      ]);

      const hedgeMTM = sumRows(matchingHedgeRows, [
        "MTMValue",
        "MTM Value",
        "MTM_x0020_Value",
        "NetMTM",
        "Net MTM",
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

      /*
       * Temporary debug output.
       * Remove after everything works correctly.
       */
      debug: {
        physicalFields: Object.keys(physicalPositions[0] || {}),
        hedgeFields: Object.keys(hedgePositions[0] || {}),
        limitFields: Object.keys(riskLimits[0] || {}),

        physicalValues: physicalPositions.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          siteOrOrigin: getPhysicalSite(row),
          volumeMT: toNumber(
            getField(row, [
              "VolumeMT",
              "Volume MT",
              "Volume_x0020_MT",
            ])
          ),
        })),

        hedgeValues: hedgePositions.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          linkedSite: getHedgeSite(row),
          volumeMT: toNumber(
            getField(row, [
              "VolumeMT",
              "Volume MT",
              "Volume_x0020_MT",
            ])
          ),
        })),

        limitValues: riskLimits.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          siteOrOrigin: getLimitSite(row),

          limitType: extractTextValue(
            getField(row, [
              "LimitType",
              "Limit Type",
              "Limit_x0020_Type",
            ])
          ),

          limitAmount: toNumber(
            getField(row, [
              "LimitAmount",
              "Limit Amount",
              "Limit_x0020_Amount",
            ])
          ),
        })),
      },
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
     * Supports payloads with nested SharePoint fields.
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

/**
 * Extract text from:
 *
 * 1. Normal strings:
 *    RawSugar
 *
 * 2. SharePoint lookup objects:
 *    { "Id": 0, "Value": "RawSugar" }
 *
 * 3. SharePoint lookup arrays:
 *    [{ "Id": 0, "Value": "RawSugar" }]
 *
 * 4. JSON arrays serialized as strings:
 *    "[{\"Id\":0,\"Value\":\"RawSugar\"}]"
 */
function extractTextValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return "";
    }

    try {
      const parsed = JSON.parse(text);
      const parsedValue = extractTextValue(parsed);

      if (parsedValue) {
        return parsedValue;
      }
    } catch {
      /*
       * Normal text, not JSON.
       */
    }

    return text;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }

    /*
     * Usually one SharePoint lookup value.
     */
    return extractTextValue(value[0]);
  }

  if (typeof value === "object") {
    const preferredValue =
      value.Value ??
      value.value ??
      value.Title ??
      value.title ??
      value.Label ??
      value.label ??
      value.Name ??
      value.name ??
      value.DisplayName ??
      value.displayName;

    if (preferredValue !== undefined && preferredValue !== null) {
      return extractTextValue(preferredValue);
    }

    /*
     * Fallback for objects with a single usable property.
     */
    const usableEntries = Object.entries(value).filter(
      ([key, entryValue]) =>
        !key.startsWith("@odata") &&
        !key.endsWith("@odata.type") &&
        entryValue !== null &&
        entryValue !== undefined
    );

    if (usableEntries.length === 1) {
      return extractTextValue(usableEntries[0][1]);
    }

    return "";
  }

  return String(value).trim();
}

function normalizeText(value) {
  return extractTextValue(value)
    .toLowerCase()
    .replace(/_x0020_/gi, "")
    .replace(/_x002f_/gi, "")
    .replace(/_x003a_/gi, "")
    .replace(/_x[0-9a-f]{4}_/gi, "")
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
   * Case-, spacing-, and SharePoint-code-insensitive match.
   */
  const rowKeys = Object.keys(row);

  for (const expectedName of possibleNames) {
    const expectedNormalized = normalizeText(expectedName);

    const matchingKey = rowKeys.find(
      (key) => normalizeText(key) === expectedNormalized
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
  return extractTextValue(
    getField(row, [
      "Commodity",
      "CommodityName",
      "Commodity Name",
      "Commodity_x0020_Name",
      "field_1",
      "field_2",
    ])
  );
}

function getPhysicalSite(row) {
  return extractTextValue(
    getField(row, [
      "SiteOrOrigin",
      "Site Or Origin",
      "Site_x0020_Or_x0020_Origin",
      "OriginOrSite",
      "Origin Or Site",
      "Origin_x0020_Or_x0020_Site",
      "Site",
      "Location",
      "field_3",
    ])
  );
}

function getHedgeSite(row) {
  return extractTextValue(
    getField(row, [
      "LinkedSite",
      "Linked Site",
      "Linked_x0020_Site",
      "LinkedSiteOrOrigin",
      "Linked Site Or Origin",
      "SiteOrOrigin",
      "Site Or Origin",
      "Site_x0020_Or_x0020_Origin",
      "OriginOrSite",
      "Origin Or Site",
      "Site",
      "Location",
      "field_7",
    ])
  );
}

function getLimitSite(row) {
  return extractTextValue(
    getField(row, [
      "SiteOrOrigin",
      "Site Or Origin",
      "Site_x0020_Or_x0020_Origin",
      "LinkedSite",
      "Linked Site",
      "OriginOrSite",
      "Origin Or Site",
      "Site",
      "Location",
      "field_2",
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
      return sameText(key.commodity, selectedCommodity);

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
    const cleanCommodity = extractTextValue(commodity);
    const cleanSite = extractTextValue(siteOrOrigin);

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
    const value = getField(row, possibleFields);
    return total + toNumber(value);
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
      "No matching exposure rows were returned.",
      "Verify the source field mappings and requested input values.",
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
