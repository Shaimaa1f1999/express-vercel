/**
 * CRC Exposure Calculation API
 *
 * POST /api/calculate-exposure
 *
 * Request body:
 * {
 *   commodity: "RawSugar" | "WhiteSugar" | "PalmOil" | "ALL" | "",
 *   siteOrOrigin: "Jeddah" | "Egypt" | "Indonesia" | "Malaysia" | "ALL" | "",
 *   asOfDate: "YYYY-MM-DD" | "ALL" | "",
 *   physicalPositions: [],
 *   hedgePositions: [],
 *   riskLimits: []
 * }
 */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

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

    const selectedCommodity = normalizeFilter(body.commodity);
    const selectedSiteOrOrigin = normalizeFilter(body.siteOrOrigin);
    const requestedDate = normalizeDateFilter(body.asOfDate);

    const physicalPositions = normalizeRows(body.physicalPositions);
    const hedgePositions = normalizeRows(body.hedgePositions);
    const riskLimits = normalizeRows(body.riskLimits);

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

    const fallbackUsed =
      Boolean(requestedDate) &&
      !exactDateMatch;

    const usedLatestBecauseNoDate =
      !requestedDate;

    const resolvedDate = exactDateMatch
      ? requestedDate
      : latestAvailableDate;

    /*
     * نحسب تاريخًا واحدًا فقط في كل استدعاء.
     */
    const datedPhysicalPositions =
      physicalPositions.filter(
        (row) =>
          getRowDate(row) === resolvedDate
      );

    const datedHedgePositions =
      hedgePositions.filter(
        (row) =>
          getRowDate(row) === resolvedDate
      );

    /*
     * نستخدم حدود NetExposure فقط.
     * Risk Limits لا تعتمد على تاريخ.
     */
    const netExposureLimits =
      riskLimits.filter((row) => {
        const limitType = getLimitType(row);

        return (
          !limitType ||
          sameText(limitType, "NetExposure")
        );
      });

    const filterStatus = deriveFilterStatus(
      selectedCommodity,
      selectedSiteOrOrigin
    );

    /*
     * نبني المواقع الحقيقية.
     * لا نعتبر All موقعًا حقيقيًا.
     */
    const exposureKeys = buildExposureKeys({
      physicalPositions:
        datedPhysicalPositions,
      hedgePositions:
        datedHedgePositions,
      riskLimits:
        netExposureLimits,
    });

    /*
     * تطبيق Commodity وSite filters.
     */
    const selectedKeys = exposureKeys.filter(
      (key) =>
        keyMatchesSelection({
          key,
          filterStatus,
          selectedCommodity,
          selectedSiteOrOrigin,
        })
    );

    /*
     * حساب صفوف المواقع أولًا.
     */
    const siteRows = selectedKeys.map(
      (key) =>
        buildSiteSnapshotRow({
          key,
          resolvedDate,
          datedPhysicalPositions,
          datedHedgePositions,
          netExposureLimits,
        })
    );

    /*
     * عندما لا يحدد المستخدم موقعًا:
     * نحسب Total حقيقي لكل Commodity.
     *
     * ALL:
     * جميع المواقع + Total لكل Commodity.
     *
     * COMMODITY_ONLY:
     * مواقع Commodity المحدد + Total.
     *
     * SITE_ONLY:
     * الموقع فقط بدون Totals.
     *
     * COMMODITY_AND_SITE:
     * صف واحد فقط.
     */
    const includeCommodityTotals =
      filterStatus === "ALL" ||
      filterStatus === "COMMODITY_ONLY";

    const commodityTotalRows =
      includeCommodityTotals
        ? buildCommodityTotalRows({
            siteRows,
            resolvedDate,
            netExposureLimits,
          })
        : [];

    const snapshotRows = sortRows([
      ...siteRows,
      ...commodityTotalRows,
    ]);

    const summary =
      buildSummary(snapshotRows);

    const dateResolution = {
      requestedDate:
        requestedDate || null,

      resolvedDate,

      latestAvailableDate,

      exactMatch:
        exactDateMatch,

      fallbackUsed,

      usedLatestBecauseNoDate,

      availableDates,
    };

    const agentMessage =
      buildAgentMessage({
        selectedCommodity,
        selectedSiteOrOrigin,
        dateResolution,
        rows: snapshotRows,
      });

    return res.status(200).json({
      success: true,

      request: {
        filterStatus,

        commodity:
          selectedCommodity || null,

        siteOrOrigin:
          selectedSiteOrOrigin || null,

        asOfDate:
          requestedDate || null,
      },

      dateResolution,

      inputCounts: {
        physicalPositions:
          physicalPositions.length,

        hedgePositions:
          hedgePositions.length,

        riskLimits:
          riskLimits.length,

        datedPhysicalPositions:
          datedPhysicalPositions.length,

        datedHedgePositions:
          datedHedgePositions.length,
      },

      summary,

      snapshotRows,

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
   HTTP
   ========================================================= */

function setCorsHeaders(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

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
    if (
      !row ||
      typeof row !== "object"
    ) {
      return {};
    }

    /*
     * Supports:
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

function normalizeFilter(value) {
  const text = extractTextValue(value);

  if (
    !text ||
    sameText(text, "ALL")
  ) {
    return "";
  }

  return text;
}

function normalizeDateFilter(value) {
  const text = extractTextValue(value);

  if (
    !text ||
    sameText(text, "ALL")
  ) {
    return "";
  }

  return normalizeDate(text);
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

/*
 * Supports:
 *
 * "RawSugar"
 * { Value: "RawSugar" }
 * [{ Value: "RawSugar" }]
 * JSON string containing Value
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
      const parsedText =
        extractTextValue(parsed);

      if (parsedText) {
        return parsedText;
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

  /*
   * Exact match first.
   */
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

  /*
   * Normalized field-name match.
   */
  const rowKeys = Object.keys(row);

  for (
    const expectedName
    of possibleNames
  ) {
    const expectedNormalized =
      normalizeText(expectedName);

    const matchingKey =
      rowKeys.find(
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

    "BusinessDate",
    "Business Date",

    "Date",

    /*
     * Physical Positions raw field.
     */
    "field_10",

    /*
     * Hedge Positions raw field.
     */
    "field_8",

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
   * ISO:
   * 2026-07-22
   * 2026-07-22T00:00:00Z
   */
  const isoDateMatch =
    rawValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (isoDateMatch) {
    return (
      `${isoDateMatch[1]}-` +
      `${isoDateMatch[2]}-` +
      `${isoDateMatch[3]}`
    );
  }

  /*
   * DD/MM/YYYY
   */
  const dayFirstMatch =
    rawValue.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (dayFirstMatch) {
    const day =
      dayFirstMatch[1].padStart(
        2,
        "0"
      );

    const month =
      dayFirstMatch[2].padStart(
        2,
        "0"
      );

    const year =
      dayFirstMatch[3];

    return `${year}-${month}-${day}`;
  }

  const parsedDate =
    new Date(rawValue);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return "";
  }

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

function collectAvailableDates(
  physicalPositions,
  hedgePositions
) {
  const dates = new Set();

  [
    ...physicalPositions,
    ...hedgePositions,
  ].forEach((row) => {
    const date = getRowDate(row);

    if (date) {
      dates.add(date);
    }
  });

  /*
   * YYYY-MM-DD sorts correctly.
   * Newest first.
   */
  return Array.from(dates).sort(
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

      /*
       * Hedge / Limits.
       */
      "field_1",

      /*
       * Physical.
       */
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

      /*
       * Physical Positions.
       */
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

      /*
       * Hedge Positions.
       */
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

      "OriginOrSite",
      "Origin Or Site",

      "Site",
      "Location",

      /*
       * Risk Limits.
       */
      "field_2",
    ])
  );
}

function getLimitType(row) {
  return extractTextValue(
    getField(row, [
      "LimitType",
      "Limit Type",
      "Limit_x0020_Type",
      "limitType",

      /*
       * Risk Limits.
       */
      "field_3",
    ])
  );
}

function getLimitAmount(row) {
  if (!row) {
    return 0;
  }

  return round(
    toNumber(
      getField(row, [
        "LimitAmount",
        "Limit Amount",
        "Limit_x0020_Amount",

        "LimitValue",
        "Limit Value",
        "Limit_x0020_Value",

        "LimitMT",
        "Limit MT",

        "ExposureLimitMT",
        "Exposure Limit MT",

        "MaxExposureMT",
        "Max Exposure MT",

        /*
         * Risk Limits.
         */
        "field_4",
      ])
    ),
    2
  );
}

/* =========================================================
   Filter behavior
   ========================================================= */

function deriveFilterStatus(
  commodity,
  siteOrOrigin
) {
  const hasCommodity =
    Boolean(cleanText(commodity));

  const hasSite =
    Boolean(cleanText(siteOrOrigin));

  if (
    !hasCommodity &&
    !hasSite
  ) {
    return "ALL";
  }

  if (
    hasCommodity &&
    !hasSite
  ) {
    return "COMMODITY_ONLY";
  }

  if (
    !hasCommodity &&
    hasSite
  ) {
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

function isAggregateSite(value) {
  return sameText(value, "ALL");
}

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

    /*
     * All is not a real location.
     * It is used only as an aggregate limit.
     */
    if (
      !cleanCommodity ||
      !cleanSite ||
      isAggregateSite(cleanSite)
    ) {
      return;
    }

    const key =
      `${normalizeText(cleanCommodity)}|` +
      `${normalizeText(cleanSite)}`;

    if (!keyMap.has(key)) {
      keyMap.set(key, {
        commodity:
          cleanCommodity,

        siteOrOrigin:
          cleanSite,
      });
    }
  }

  /*
   * Real source locations.
   */
  physicalPositions.forEach(
    (row) => {
      addKey(
        getCommodity(row),
        getPhysicalSite(row)
      );
    }
  );

  hedgePositions.forEach(
    (row) => {
      addKey(
        getCommodity(row),
        getHedgeSite(row)
      );
    }
  );

  /*
   * Site-level limit-only rows remain supported.
   * All limits are ignored here.
   */
  riskLimits.forEach(
    (row) => {
      addKey(
        getCommodity(row),
        getLimitSite(row)
      );
    }
  );

  return Array.from(
    keyMap.values()
  );
}

/* =========================================================
   Site calculation
   ========================================================= */

function buildSiteSnapshotRow({
  key,
  resolvedDate,
  datedPhysicalPositions,
  datedHedgePositions,
  netExposureLimits,
}) {
  const matchingPhysicalRows =
    datedPhysicalPositions.filter(
      (row) =>
        sameText(
          getCommodity(row),
          key.commodity
        ) &&
        sameText(
          getPhysicalSite(row),
          key.siteOrOrigin
        )
    );

  const matchingHedgeRows =
    datedHedgePositions.filter(
      (row) =>
        sameText(
          getCommodity(row),
          key.commodity
        ) &&
        sameText(
          getHedgeSite(row),
          key.siteOrOrigin
        )
    );

  const matchingLimitRows =
    netExposureLimits.filter(
      (row) =>
        sameText(
          getCommodity(row),
          key.commodity
        ) &&
        sameText(
          getLimitSite(row),
          key.siteOrOrigin
        )
    );

  const physicalMT = round(
    sumRows(
      matchingPhysicalRows,
      [
        "VolumeMT",
        "Volume MT",
        "Volume_x0020_MT",

        "PhysicalMT",
        "Physical MT",

        "QuantityMT",
        "Quantity MT",

        "Volume",

        /*
         * Physical Positions.
         */
        "field_5",
      ]
    ),
    2
  );

  const hedgeMT = round(
    sumRows(
      matchingHedgeRows,
      [
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

        /*
         * Hedge Positions.
         */
        "field_4",
      ]
    ),
    2
  );

  /*
   * Hedge is already negative.
   */
  const netMT = round(
    physicalMT + hedgeMT,
    2
  );

  const absNetMT =
    Math.abs(netMT);

  const physicalMTM = sumRows(
    matchingPhysicalRows,
    [
      "MTMValue",
      "MTM Value",
      "MTM_x0020_Value",

      "NetMTM",
      "Net MTM",

      /*
       * Physical Positions.
       */
      "field_8",
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

      /*
       * Hedge Positions.
       */
      "field_6",
    ]
  );

  const netMTM = round(
    physicalMTM + hedgeMTM,
    2
  );

  const limitRow =
    matchingLimitRows[0] || null;

  const limitAmount =
    getLimitAmount(limitRow);

  const utilizationPct =
    calculateUtilization(
      netMT,
      limitAmount
    );

  const status =
    utilizationPct === null
      ? "NO_LIMIT"
      : calculateStatus(
          utilizationPct
        );

  return {
    asOfDate:
      resolvedDate,

    commodity:
      key.commodity,

    siteOrOrigin:
      key.siteOrOrigin,

    isCommodityTotal:
      false,

    physicalMT,
    hedgeMT,
    netMT,
    absNetMT,
    netMTM,

    limitType:
      "NetExposure",

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
}

/* =========================================================
   Commodity totals
   ========================================================= */

function buildCommodityTotalRows({
  siteRows,
  resolvedDate,
  netExposureLimits,
}) {
  const commodityMap =
    new Map();

  siteRows.forEach((row) => {
    const commodityKey =
      normalizeText(row.commodity);

    if (
      !commodityMap.has(
        commodityKey
      )
    ) {
      commodityMap.set(
        commodityKey,
        {
          commodity:
            row.commodity,

          rows: [],
        }
      );
    }

    commodityMap
      .get(commodityKey)
      .rows
      .push(row);
  });

  return Array.from(
    commodityMap.values()
  ).map(
    ({ commodity, rows }) => {
      const physicalMT = round(
        rows.reduce(
          (total, row) =>
            total +
            toNumber(
              row.physicalMT
            ),
          0
        ),
        2
      );

      const hedgeMT = round(
        rows.reduce(
          (total, row) =>
            total +
            toNumber(
              row.hedgeMT
            ),
          0
        ),
        2
      );

      const netMT = round(
        physicalMT + hedgeMT,
        2
      );

      const absNetMT =
        Math.abs(netMT);

      const netMTM = round(
        rows.reduce(
          (total, row) =>
            total +
            toNumber(
              row.netMTM
            ),
          0
        ),
        2
      );

      /*
       * Prefer Commodity + All limit.
       */
      const aggregateLimitRow =
        netExposureLimits.find(
          (row) =>
            sameText(
              getCommodity(row),
              commodity
            ) &&
            isAggregateSite(
              getLimitSite(row)
            )
        ) || null;

      let limitAmount =
        getLimitAmount(
          aggregateLimitRow
        );

      /*
       * If an All limit does not exist,
       * sum site limits.
       */
      if (limitAmount <= 0) {
        limitAmount = round(
          rows.reduce(
            (total, row) =>
              total +
              Math.max(
                0,
                toNumber(
                  row.limitAmount
                )
              ),
            0
          ),
          2
        );
      }

      const utilizationPct =
        calculateUtilization(
          netMT,
          limitAmount
        );

      const status =
        utilizationPct === null
          ? "NO_LIMIT"
          : calculateStatus(
              utilizationPct
            );

      return {
        asOfDate:
          resolvedDate,

        commodity,

        siteOrOrigin:
          "All",

        isCommodityTotal:
          true,

        physicalMT,
        hedgeMT,
        netMT,
        absNetMT,
        netMTM,

        limitType:
          "NetExposure",

        limitAmount,
        utilizationPct,
        status,

        sourceCounts: {
          physicalRows:
            sumSourceCount(
              rows,
              "physicalRows"
            ),

          hedgeRows:
            sumSourceCount(
              rows,
              "hedgeRows"
            ),

          limitRows:
            aggregateLimitRow
              ? 1
              : sumSourceCount(
                  rows,
                  "limitRows"
                ),
        },
      };
    }
  );
}

function sumSourceCount(
  rows,
  property
) {
  return rows.reduce(
    (total, row) =>
      total +
      toNumber(
        row.sourceCounts?.[
          property
        ]
      ),
    0
  );
}

/* =========================================================
   Calculation helpers
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

  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(/\s/g, "")
      .trim();

  const number =
    Number(cleaned);

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
      const value =
        getField(
          row,
          possibleFields
        );

      return (
        total +
        toNumber(value)
      );
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
      (
        toNumber(value) +
        Number.EPSILON
      ) *
        factor
    ) / factor
  );
}

function calculateUtilization(
  netMT,
  limitAmount
) {
  const numericLimit =
    Math.abs(
      toNumber(limitAmount)
    );

  if (numericLimit <= 0) {
    return null;
  }

  return round(
    (
      Math.abs(
        toNumber(netMT)
      ) /
      numericLimit
    ) *
      100,
    1
  );
}

function calculateStatus(
  utilizationPct
) {
  const utilization =
    toNumber(
      utilizationPct
    );

  if (utilization >= 100) {
    return "Breach";
  }

  if (utilization >= 70) {
    return "Watch";
  }

  return "OK";
}

/* =========================================================
   Summary and sorting
   ========================================================= */

function buildSummary(rows) {
  return {
    totalRows:
      rows.length,

    siteRowCount:
      rows.filter(
        (row) =>
          !row.isCommodityTotal
      ).length,

    commodityTotalCount:
      rows.filter(
        (row) =>
          row.isCommodityTotal
      ).length,

    okCount:
      rows.filter(
        (row) =>
          row.status === "OK"
      ).length,

    watchCount:
      rows.filter(
        (row) =>
          row.status === "Watch"
      ).length,

    breachCount:
      rows.filter(
        (row) =>
          row.status === "Breach"
      ).length,

    noLimitCount:
      rows.filter(
        (row) =>
          row.status === "NO_LIMIT"
      ).length,
  };
}

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
        (
          statusPriority[
            left.status
          ] || 99
        ) -
        (
          statusPriority[
            right.status
          ] || 99
        );

      if (
        statusDifference !== 0
      ) {
        return statusDifference;
      }

      const commodityDifference =
        cleanText(
          left.commodity
        ).localeCompare(
          cleanText(
            right.commodity
          )
        );

      if (
        commodityDifference !== 0
      ) {
        return commodityDifference;
      }

      /*
       * Site rows before Total.
       */
      if (
        Boolean(
          left.isCommodityTotal
        ) !==
        Boolean(
          right.isCommodityTotal
        )
      ) {
        return left.isCommodityTotal
          ? 1
          : -1;
      }

      const leftUtilization =
        left.utilizationPct === null
          ? -1
          : toNumber(
              left.utilizationPct
            );

      const rightUtilization =
        right.utilizationPct === null
          ? -1
          : toNumber(
              right.utilizationPct
            );

      if (
        leftUtilization !==
        rightUtilization
      ) {
        return (
          rightUtilization -
          leftUtilization
        );
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

/* =========================================================
   Agent response formatting
   ========================================================= */

function buildAgentMessage({
  selectedCommodity,
  selectedSiteOrOrigin,
  dateResolution,
  rows,
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

  const lines = [
    "Exposure Snapshot",
  ];

  if (
    dateResolution.fallbackUsed
  ) {
    lines.push(
      `No exposure data was available for ${dateResolution.requestedDate}.`,
      `Using the latest available data date: ${dateResolution.resolvedDate}.`
    );
  } else {
    lines.push(
      `Data date: ${dateResolution.resolvedDate}.`
    );
  }

  lines.push(
    `Selection: ${selectionText}`
  );

  if (rows.length === 0) {
    lines.push(
      "",
      "No matching exposure data was returned for the selected filters."
    );

    return lines.join("\n");
  }

  const siteRows =
    rows.filter(
      (row) =>
        !row.isCommodityTotal
    );

  const commodityTotals =
    rows.filter(
      (row) =>
        row.isCommodityTotal
    );

  const statuses = [
    "Breach",
    "Watch",
    "OK",
    "NO_LIMIT",
  ];

  statuses.forEach((status) => {
    const matchingRows =
      siteRows.filter(
        (row) =>
          row.status === status
      );

    if (
      matchingRows.length === 0
    ) {
      return;
    }

    lines.push(
      "",
      status === "NO_LIMIT"
        ? "NO LIMIT"
        : status.toUpperCase()
    );

    matchingRows.forEach(
      (row) => {
        appendExposureRow(
          lines,
          row
        );
      }
    );
  });

  if (
    commodityTotals.length > 0
  ) {
    lines.push(
      "",
      "COMMODITY TOTALS"
    );

    commodityTotals.forEach(
      (row) => {
        appendExposureRow(
          lines,
          row
        );
      }
    );
  }

  const breachCount =
    siteRows.filter(
      (row) =>
        row.status === "Breach"
    ).length;

  const watchCount =
    siteRows.filter(
      (row) =>
        row.status === "Watch"
    ).length;

  const okCount =
    siteRows.filter(
      (row) =>
        row.status === "OK"
    ).length;

  lines.push(
    "",
    "SUMMARY",
    `Site rows: ${siteRows.length}`,
    `Commodity totals: ${commodityTotals.length}`,
    `Breach: ${breachCount}`,
    `Watch: ${watchCount}`,
    `OK: ${okCount}`
  );

  return lines.join("\n");
}

function appendExposureRow(
  lines,
  row
) {
  const utilizationText =
    row.utilizationPct === null
      ? "No limit"
      : `${formatNumber(
          row.utilizationPct
        )}%`;

  lines.push(
    "",
    `${row.commodity} | ${row.siteOrOrigin}`,
    `Physical MT: ${formatNumber(row.physicalMT)}`,
    `Hedge MT: ${formatNumber(row.hedgeMT)}`,
    `Net MT: ${formatNumber(row.netMT)}`,
    `Limit Amount: ${formatNumber(row.limitAmount)}`,
    `Utilization: ${utilizationText}`,
    `Status: ${row.status}`
  );
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
  ).format(
    toNumber(value)
  );
}
