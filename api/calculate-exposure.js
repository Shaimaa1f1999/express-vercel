/**
 * CRC Exposure Calculation API
 * Route: POST /api/calculate-exposure
 *
 * Expected body:
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

    const exposureKeys = buildExposureKeys({
      physicalPositions,
      hedgePositions,
      riskLimits: netExposureLimits,
    });

    const selectedKeys = exposureKeys.filter((key) =>
      keyMatchesSelection({
        key,
        filterStatus,
        selectedCommodity,
        selectedSiteOrOrigin,
      })
    );

    const snapshotRows = selectedKeys.map((key) => {
      const matchingPhysicalRows = physicalPositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getPhysicalSite(row), key.siteOrOrigin)
        );
      });

      const matchingHedgeRows = hedgePositions.filter((row) => {
        return (
          sameText(getCommodity(row), key.commodity) &&
          sameText(getHedgeSite(row), key.siteOrOrigin)
        );
      });

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
      okCount: sortedRows.filter((row) => row.status === "OK").length,
      watchCount: sortedRows.filter((row) => row.status === "Watch").length,
      breachCount: sortedRows.filter((row) => row.status === "Breach").length,
      noLimitCount: sortedRows.filter((row) => row.status === "NO_LIMIT").length,
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

      debug: {
        physicalFields: Object.keys(physicalPositions[0] || {}),
        hedgeFields: Object.keys(hedgePositions[0] || {}),
        limitFields: Object.keys(riskLimits[0] || {}),

        physicalValues: physicalPositions.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          siteOrOrigin: getPhysicalSite(row),
          volumeMT: getField(row, [
            "VolumeMT",
            "Volume MT",
            "Volume_x0020_MT",
          ]),
        })),

        hedgeValues: hedgePositions.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          linkedSite: getHedgeSite(row),
          volumeMT: getField(row, [
            "VolumeMT",
            "Volume MT",
            "Volume_x0020_MT",
          ]),
        })),

        limitValues: riskLimits.slice(0, 10).map((row) => ({
          commodity: getCommodity(row),
          siteOrOrigin: getLimitSite(row),
          limitType: getField(row, [
            "LimitType",
            "Limit Type",
            "Limit_x0020_Type",
          ]),
          limitAmount: getField(row, [
            "LimitAmount",
            "Limit Amount",
            "Limit_x0020_Amount",
          ]),
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

function extractTextValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return cleanText(value);
  }

  if (typeof value === "object") {
    return cleanText(
      value.Value ??
        value.value ??
        value.Title ??
        value.title ??
        value.Label ??
        value.label ??
        value.Name ??
        value.name ??
        ""
    );
  }

  return cleanText(value);
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

  for (const name of possibleNames) {
    if (
      Object.prototype.hasOwnProperty.call(row, name) &&
      row[name] !== null &&
      row[name] !== undefined
    ) {
      return row[name];
    }
  }

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
      return sameText(key.siteOrOrigin, selectedSiteOrOrigin);

    case "COMMODITY_AND_SITE":
      return (
        sameText(key.commodity, selectedCommodity) &&
        sameText(key.siteOrOrigin, selectedSiteOrOrigin)
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
    addKey(getCommodity(row), getPhysicalSite(row));
  });

  hedgePositions.forEach((row) => {
    addKey(getCommodity(row), getHedgeSite(row));
  });

  riskLimits.forEach((row) => {
    addKey(getCommodity(row), getLimitSite(row));
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

  if (value === null || value === undefined || value === "") {
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
    return total + toNumber(getField(row, possibleFields));
  }, 0);
}

function round(value, decimalPlaces = 2) {
  const factor = 10 ** decimalPlaces;

  return (
    Math.round((toNumber(value) + Number.EPSILON) * factor) / factor
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

    const commodityDifference = cleanText(left.commodity).localeCompare(
      cleanText(right.commodity)
    );

    if (commodityDifference !== 0) {
      return commodityDifference;
    }

    return cleanText(left.siteOrOrigin).localeCompare(
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
    selection.push(`Commodity: ${selectedCommodity}`);
  }

  if (selectedSiteOrOrigin) {
    selection.push(`Site/Origin: ${selectedSiteOrOrigin}`);
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
