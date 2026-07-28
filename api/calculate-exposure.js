/**
 * CRC Exposure Calculation API
 *
 * Route:
 * POST /api/calculate-exposure
 *
 * Request body:
 * {
 *   "commodity": "RawSugar" | "WhiteSugar" | "PalmOil" | "ALL",
 *   "siteOrOrigin": "Jeddah" | "Egypt" | "Indonesia" | "Malaysia" | "ALL",
 *   "asOfDate": "2026-07-22" | "ALL" | "",
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

    /*
     * Normalize filters.
     * ALL means no Commodity/Site filter.
     */
    const rawCommodity = extractTextValue(body.commodity);
    const rawSiteOrOrigin = extractTextValue(body.siteOrOrigin);
    const rawAsOfDate = extractTextValue(body.asOfDate);

    const selectedCommodity =
      !rawCommodity || sameText(rawCommodity, "ALL")
        ? ""
        : rawCommodity;

    const selectedSiteOrOrigin =
      !rawSiteOrOrigin || sameText(rawSiteOrOrigin, "ALL")
        ? ""
        : rawSiteOrOrigin;

    /*
     * ALL or empty date means:
     * Use the latest date found in the source data.
     */
    const requestedDate =
      !rawAsOfDate || sameText(rawAsOfDate, "ALL")
        ? ""
        : normalizeDate(rawAsOfDate);

    const physicalPositions = normalizeRows(body.physicalPositions);
    const hedgePositions = normalizeRows(body.hedgePositions);
    const riskLimits = normalizeRows(body.riskLimits);

    /*
     * Discover dates dynamically.
     * No fixed or hardcoded dates.
     */
    const availableDates = collectAvailableDates(
      physicalPositions,
      hedgePositions
    );

    if (availableDates.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "No valid AsOfDate values were found in Physical Positions or Hedge Positions.",
      });
    }

    const latestAvailableDate = availableDates[0];

    const exactDateMatch =
      Boolean(requestedDate) &&
      availableDates.includes(requestedDate);

    const usedLatestBecauseNoDate = !requestedDate;

    const fallbackUsed =
      Boolean(requestedDate) &&
      !exactDateMatch;

    const resolvedDate = exactDateMatch
      ? requestedDate
      : latestAvailableDate;

    /*
     * Filter source rows by the resolved date before calculating.
     * This prevents combining multiple trading dates.
     */
    const datedPhysicalPositions = physicalPositions.filter(
      (row) => getRowDate(row) === resolvedDate
    );

    const datedHedgePositions = hedgePositions.filter(
      (row) => getRowDate(row) === resolvedDate
    );

    /*
     * Risk limits normally remain effective across dates.
     * Only NetExposure limits are used.
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

    const filterStatus = deriveFilterStatus(
      selectedCommodity,
      selectedSiteOrOrigin
    );

    /*
     * Build all Commodity + Site keys available for the resolved date.
     */
    const exposureKeys = buildExposureKeys({
      physicalPositions: datedPhysicalPositions,
      hedgePositions: datedHedgePositions,
      riskLimits: netExposureLimits,
    });

    /*
     * Apply Commodity and Site filters.
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
       * Physical rows:
       * Commodity + SiteOrOrigin + resolved date
       */
      const matchingPhysicalRows =
        datedPhysicalPositions.filter((row) => {
          return (
            sameText(getCommodity(row), key.commodity) &&
            sameText(
              getPhysicalSite(row),
              key.siteOrOrigin
            )
          );
        });

      /*
       * Hedge rows:
       * Commodity + LinkedSite + resolved date
       */
      const matchingHedgeRows =
        datedHedgePositions.filter((row) => {
          return (
            sameText(getCommodity(row), key.commodity) &&
            sameText(
              getHedgeSite(row),
              key.siteOrOrigin
            )
          );
        });

      /*
       * Risk limit:
       * Commodity + SiteOrOrigin
       */
      const matchingLimitRows =
        netExposureLimits.filter((row) => {
          return (
            sameText(getCommodity(row), key.commodity) &&
            sameText(
              getLimitSite(row),
              key.siteOrOrigin
            )
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
       * Hedges are already stored as negative values.
       */
      const netMT = round(
        physicalMT + hedgeMT,
        2
      );

      const absNetMT = Math.abs(netMT);

      const physicalMTM = sumRows(
        matchingPhysicalRows,
        [
          "MTMValue",
          "MTM Value",
          "MTM_x0020_Value",
          "NetMTM",
          "Net MTM",
        ]
      );

      const hedgeMTM = sumRows(
        matchingHedgeRows,
        [
          "MTMValue",
          "MTM Value",
          "MTM_x0020_Value",
          "NetMTM",
          "Net MTM",
        ]
      );

      const netMTM = round(
        physicalMTM + hedgeMTM,
        2
      );

      const limitRow =
        matchingLimitRows[0] || null;

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
          ? round(
              (absNetMT /
                Math.abs(limitAmount)) *
                100,
              1
            )
          : null;

      const status =
        utilizationPct === null
          ? "NO_LIMIT"
          : calculateStatus(utilizationPct);

      return {
        asOfDate: resolvedDate,

        commodity: key.commodity,
        siteOrOrigin: key.siteOrOrigin,

        physicalMT,
        hedgeMT,
        netMT,
        absNetMT,
        netMTM,

        limitType: "NetExposure",
        limitAmount,
        utilizationPct,
        status,

        sourceCounts: {
          physicalRows:
            matchingPhysicalRows.length,
          hedgeRows:
            matchingHedgeRows.length,
          limitRows:
            matchingLimitRows.length,
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

    const dateResolution = {
      requestedDate: requestedDate || null,
      resolvedDate,
      latestAvailableDate,

      exactMatch: exactDateMatch,
      fallbackUsed,
      usedLatestBecauseNoDate,

      availableDates,
    };

    const agentMessage = buildAgentMessage({
      filterStatus,
      selectedCommodity,
      selectedSiteOrOrigin,

      dateResolution,
      rows: sortedRows,
      summary,
    });

    return res.status(200).json({
      success: true,

      request: {
        filterStatus,
        commodity:
          selectedCommodity || null,
        siteOrOrigin:
          selectedSiteOrOrigin || null,
        asOfDate: requestedDate || null,
      },

      dateResolution,

      inputCounts: {
        physicalPositions:
          physicalPositions.length,

        hedgePositions:
          hedgePositions.length,

        riskLimits: riskLimits.length,

        datedPhysicalPositions:
          datedPhysicalPositions.length,

        datedHedgePositions:
          datedHedgePositions.length,
      },

      summary,
      snapshotRows: sortedRows,
      agentMessage,
    });
  } catch (error) {
    console.error(
      "Exposure calculation failed:",
      error
    );

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
  } else if (
    input &&
    Array.isArray(input.value)
  ) {
    rows = input.value;
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      return {};
    }

    /*
     * Supports payloads containing:
     * {
     *   fields: {
     *     Commodity: "...",
     *     AsOfDate: "..."
     *   }
     * }
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
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/**
 * Extracts text from:
 *
 * RawSugar
 *
 * { Value: "RawSugar" }
 *
 * [{ Value: "RawSugar" }]
 *
 * "[{\"Value\":\"RawSugar\"}]"
 */

function extractTextValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return "";
    }

    try {
      const parsed = JSON.parse(text);

      const parsedValue =
        extractTextValue(parsed);

      if (parsedValue) {
        return parsedValue;
      }
    } catch {
      // Normal string.
    }

    return text;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }

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

    if (
      preferredValue !== undefined &&
      preferredValue !== null
    ) {
      return extractTextValue(
        preferredValue
      );
    }

    const usableEntries =
      Object.entries(value).filter(
        ([key, entryValue]) =>
          !key.startsWith("@odata") &&
          !key.endsWith("@odata.type") &&
          entryValue !== null &&
          entryValue !== undefined
      );

    if (usableEntries.length === 1) {
      return extractTextValue(
        usableEntries[0][1]
      );
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
  return (
    normalizeText(left) ===
    normalizeText(right)
  );
}

function getField(row, possibleNames) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return undefined;
  }

  for (const name of possibleNames) {
    if (
      Object.prototype.hasOwnProperty.call(
        row,
        name
      ) &&
      row[name] !== null &&
      row[name] !== undefined
    ) {
      return row[name];
    }
  }

  const rowKeys = Object.keys(row);

  for (const expectedName of possibleNames) {
    const expectedNormalized =
      normalizeText(expectedName);

    const matchingKey = rowKeys.find(
      (key) =>
        normalizeText(key) ===
        expectedNormalized
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
   Date handling
   ========================================================= */

function getRowDate(row) {
  const value = getField(row, [
    "AsOfDate",
    "As Of Date",
    "AsOf Date",
    "As_x0020_Of_x0020_Date",

    "TradeDate",
    "Trade Date",
    "Trade_x0020_Date",

    "Date",
    "BusinessDate",
    "Business Date",

    "field_10",
    "field_11",
  ]);

  return normalizeDate(value);
}

function normalizeDate(value) {
  const rawValue =
    extractTextValue(value);

  if (!rawValue) {
    return "";
  }

  /*
   * Handles SharePoint ISO dates:
   * 2026-07-22T00:00:00Z
   */
  const isoDateMatch =
    rawValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  /*
   * Handles DD/MM/YYYY.
   */
  const dayFirstMatch =
    rawValue.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (dayFirstMatch) {
    const day = dayFirstMatch[1].padStart(
      2,
      "0"
    );

    const month =
      dayFirstMatch[2].padStart(
        2,
        "0"
      );

    const year = dayFirstMatch[3];

    return `${year}-${month}-${day}`;
  }

  /*
   * Last fallback for readable date strings.
   */
  const parsedDate = new Date(rawValue);

  if (
    !Number.isNaN(parsedDate.getTime())
  ) {
    const year =
      parsedDate.getUTCFullYear();

    const month = String(
      parsedDate.getUTCMonth() + 1
    ).padStart(2, "0");

    const day = String(
      parsedDate.getUTCDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
}

function collectAvailableDates(
  physicalPositions,
  hedgePositions
) {
  const dateSet = new Set();

  [
    ...physicalPositions,
    ...hedgePositions,
  ].forEach((row) => {
    const date = getRowDate(row);

    if (date) {
      dateSet.add(date);
    }
  });

  /*
   * YYYY-MM-DD strings sort correctly.
   * Newest date first.
   */
  return Array.from(dateSet).sort(
    (left, right) =>
      right.localeCompare(left)
  );
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

function deriveFilterStatus(
  commodity,
  siteOrOrigin
) {
  const hasCommodity = Boolean(
    cleanText(commodity)
  );

  const hasSite = Boolean(
    cleanText(siteOrOrigin)
  );

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
        sameText(
          key.commodity,
          selectedCommodity
        ) &&
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

  function addKey(
    commodity,
    siteOrOrigin
  ) {
    const cleanCommodity =
      extractTextValue(commodity);

    const cleanSite =
      extractTextValue(siteOrOrigin);

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

  return Array.from(
    keyMap.values()
  );
}

/* =========================================================
   Calculations
   ========================================================= */

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
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

  return Number.isFinite(number)
    ? number
    : 0;
}

function sumRows(
  rows,
  possibleFields
) {
  return rows.reduce(
    (total, row) => {
      const value = getField(
        row,
        possibleFields
      );

      return total + toNumber(value);
    },
    0
  );
}

function round(
  value,
  decimalPlaces = 2
) {
  const factor =
    10 ** decimalPlaces;

  return (
    Math.round(
      (toNumber(value) +
        Number.EPSILON) *
        factor
    ) / factor
  );
}

function calculateStatus(
  utilizationPct
) {
  const utilization =
    toNumber(utilizationPct);

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

  return [...rows].sort(
    (left, right) => {
      const statusDifference =
        (statusPriority[left.status] ||
          99) -
        (statusPriority[right.status] ||
          99);

      if (statusDifference !== 0) {
        return statusDifference;
      }

      if (
        right.utilizationPct !==
        left.utilizationPct
      ) {
        return (
          toNumber(
            right.utilizationPct
          ) -
          toNumber(
            left.utilizationPct
          )
        );
      }

      const commodityDifference =
        cleanText(
          left.commodity
        ).localeCompare(
          cleanText(right.commodity)
        );

      if (
        commodityDifference !== 0
      ) {
        return commodityDifference;
      }

      return cleanText(
        left.siteOrOrigin
      ).localeCompare(
        cleanText(
          right.siteOrOrigin
        )
      );
    }
  );
}

function buildAgentMessage({
  filterStatus,
  selectedCommodity,
  selectedSiteOrOrigin,

  dateResolution,
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

  const dateLines = [];

  if (
    dateResolution.usedLatestBecauseNoDate
  ) {
    dateLines.push(
      "No date was specified."
    );

    dateLines.push(
      `Using the latest available data date: ${dateResolution.resolvedDate}.`
    );
  } else if (
    dateResolution.exactMatch
  ) {
    dateLines.push(
      `Requested date: ${dateResolution.requestedDate}.`
    );

    dateLines.push(
      "Exposure data was found for the requested date."
    );
  } else if (
    dateResolution.fallbackUsed
  ) {
    dateLines.push(
      `No exposure data was found for ${dateResolution.requestedDate}.`
    );

    dateLines.push(
      `Using the latest available data date instead: ${dateResolution.resolvedDate}.`
    );
  }

  dateLines.push(
    `Available dates: ${dateResolution.availableDates.join(", ")}.`
  );

  if (rows.length === 0) {
    return [
      "Exposure Snapshot Results",
      ...dateLines,
      `Filter: ${filterStatus}`,
      `Selection: ${selectionText}`,
      "",
      "No matching exposure rows were returned for the selected Commodity and Site/Origin.",
    ].join("\n");
  }

  const detailLines = rows.map(
    (row) => {
      const utilizationText =
        row.utilizationPct === null
          ? "No limit"
          : `${formatNumber(
              row.utilizationPct
            )}%`;

      return (
        `${row.commodity} ${row.siteOrOrigin}: ` +
        `Physical ${formatNumber(
          row.physicalMT
        )} MT | ` +
        `Hedge ${formatNumber(
          row.hedgeMT
        )} MT | ` +
        `Net ${formatNumber(
          row.netMT
        )} MT | ` +
        `Limit ${formatNumber(
          row.limitAmount
        )} MT | ` +
        `Util ${utilizationText} | ` +
        `${row.status}`
      );
    }
  );

  return [
    "Exposure Snapshot Results",
    ...dateLines,

    `Resolved data date: ${dateResolution.resolvedDate}`,
    `Filter: ${filterStatus}`,
    `Selection: ${selectionText}`,

    `Rows: ${summary.totalRows}`,
    `OK: ${summary.okCount}`,
    `Watch: ${summary.watchCount}`,
    `Breach: ${summary.breachCount}`,

    "",
    ...detailLines,
  ].join("\n");
}

function formatNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "N/A";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  ).format(toNumber(value));
}
