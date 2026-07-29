/**
 * Scheduled CRC Exposure Snapshot API
 *
 * Route:
 * POST /api/save-exposure-snapshot
 *
 * This endpoint has no Commodity, Site, or Date filters.
 * It always:
 * 1. Finds the latest common AsOfDate available in both
 *    Physical Positions and Hedge Positions.
 * 2. Calculates all site/origin exposure rows.
 * 3. Calculates one Commodity Total row for each commodity.
 * 4. Returns SharePoint-ready rows.
 *
 * Request body:
 * {
 *   "physicalPositions": [],
 *   "hedgePositions": [],
 *   "riskLimits": []
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

    const physicalPositions = normalizeRows(
      body.physicalPositions
    );

    const hedgePositions = normalizeRows(
      body.hedgePositions
    );

    const riskLimits = normalizeRows(
      body.riskLimits
    );

    /*
     * Collect available dates separately from each source.
     */
    const physicalAvailableDates =
      collectSourceDates(
        physicalPositions
      );

    const hedgeAvailableDates =
      collectSourceDates(
        hedgePositions
      );

    if (
      physicalAvailableDates.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "No valid AsOfDate values were found in Physical Positions.",
        physicalAvailableDates,
        hedgeAvailableDates,
      });
    }

    if (
      hedgeAvailableDates.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "No valid AsOfDate values were found in Hedge Positions.",
        physicalAvailableDates,
        hedgeAvailableDates,
      });
    }

    /*
     * Find dates that exist in both Physical Positions
     * and Hedge Positions.
     *
     * This prevents mixing source data from different
     * business dates in one exposure snapshot.
     */
    const commonAvailableDates =
      findCommonDates(
        physicalAvailableDates,
        hedgeAvailableDates
      );

    if (
      commonAvailableDates.length === 0
    ) {
      return res.status(409).json({
        success: false,
        error:
          "No common AsOfDate exists between Physical Positions and Hedge Positions. Snapshot was not generated.",
        dateSelectionPolicy:
          "LATEST_COMMON_DATE",
        physicalAvailableDates,
        hedgeAvailableDates,
        commonAvailableDates,
      });
    }

    /*
     * Common dates are sorted newest first.
     */
    const resolvedDate =
      commonAvailableDates[0];

    /*
     * Only calculate rows from the resolved business date.
     */
    const datedPhysicalPositions =
      physicalPositions.filter(
        (row) =>
          getRowDate(row) ===
          resolvedDate
      );

    const datedHedgePositions =
      hedgePositions.filter(
        (row) =>
          getRowDate(row) ===
          resolvedDate
      );

    /*
     * Defensive validation.
     *
     * The resolved date must contain records
     * from both source lists.
     */
    if (
      datedPhysicalPositions.length === 0 ||
      datedHedgePositions.length === 0
    ) {
      return res.status(409).json({
        success: false,
        error:
          `Exposure data is incomplete for ${resolvedDate}. ` +
          "Snapshot was not generated.",
        resolvedDate,
        dateSelectionPolicy:
          "LATEST_COMMON_DATE",
        datedPhysicalCount:
          datedPhysicalPositions.length,
        datedHedgeCount:
          datedHedgePositions.length,
      });
    }

    /*
     * Risk Limits do not have AsOfDate.
     * Only NetExposure limits are relevant.
     */
    const netExposureLimits =
      riskLimits.filter((row) => {
        const limitType =
          getLimitType(row);

        return (
          !limitType ||
          sameText(
            limitType,
            "NetExposure"
          )
        );
      });

    /*
     * Build only real site/origin keys.
     *
     * A Risk Limit where Site = All is an aggregate limit,
     * not a physical location.
     */
    const exposureKeys =
      buildExposureKeys({
        physicalPositions:
          datedPhysicalPositions,

        hedgePositions:
          datedHedgePositions,

        riskLimits:
          netExposureLimits,
      });

    if (exposureKeys.length === 0) {
      return res.status(409).json({
        success: false,
        error:
          `No valid Commodity and Site/Origin combinations were found for ${resolvedDate}.`,
        resolvedDate,
      });
    }

    /*
     * Calculate actual site/origin rows.
     */
    const siteRows =
      exposureKeys.map((key) =>
        buildSiteSnapshotRow({
          key,
          resolvedDate,
          datedPhysicalPositions,
          datedHedgePositions,
          netExposureLimits,
        })
      );

    /*
     * Calculate one All row per commodity.
     */
    const commodityTotalRows =
      buildCommodityTotalRows({
        siteRows,
        resolvedDate,
        netExposureLimits,
      });

    /*
     * Site rows first, then Commodity Totals.
     */
    const calculatedRows = [
      ...sortSiteRows(siteRows),
      ...sortCommodityRows(
        commodityTotalRows
      ),
    ];

    /*
     * Create SharePoint-ready rows.
     *
     * SnapshotId examples:
     * SNP-20260722-01
     * SNP-20260722-02
     */
    const sharePointRows =
      calculatedRows.map(
        (row, index) => ({
          SnapshotId:
            buildSnapshotId(
              resolvedDate,
              index + 1
            ),

          AsOfDate:
            resolvedDate,

          Commodity:
            row.commodity,

          SiteOrOrigin:
            row.siteOrOrigin,

          PhysicalMT:
            row.physicalMT,

          HedgeMT:
            row.hedgeMT,

          NetMT:
            row.netMT,

          NetMTM:
            row.netMTM,

          LimitAmount:
            row.limitAmount,

          UtilizationPct:
            row.utilizationPct,

          Status:
            row.status,

          IsCommodityTotal:
            row.isCommodityTotal,
        })
      );

    const summary = {
      resolvedDate,

      dateSelectionPolicy:
        "LATEST_COMMON_DATE",

      totalRows:
        sharePointRows.length,

      siteRows:
        sharePointRows.filter(
          (row) =>
            !row.IsCommodityTotal
        ).length,

      commodityTotals:
        sharePointRows.filter(
          (row) =>
            row.IsCommodityTotal
        ).length,

      breachCount:
        sharePointRows.filter(
          (row) =>
            row.Status ===
            "Breach"
        ).length,

      watchCount:
        sharePointRows.filter(
          (row) =>
            row.Status ===
            "Watch"
        ).length,

      okCount:
        sharePointRows.filter(
          (row) =>
            row.Status ===
            "OK"
        ).length,

      noLimitCount:
        sharePointRows.filter(
          (row) =>
            row.Status ===
            "NO_LIMIT"
        ).length,
    };

    return res.status(200).json({
      success: true,

      resolvedDate,

      dateSelectionPolicy:
        "LATEST_COMMON_DATE",

      physicalAvailableDates,

      hedgeAvailableDates,

      commonAvailableDates,

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

        netExposureLimits:
          netExposureLimits.length,
      },

      summary,

      /*
       * Use this array in Power Automate Apply to each.
       */
      snapshotRows:
        sharePointRows,
    });
  } catch (error) {
    console.error(
      "Scheduled exposure snapshot failed:",
      error
    );

    return res.status(400).json({
      success: false,

      error:
        error instanceof Error
          ? error.message
          : "Scheduled exposure snapshot failed.",
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
   Row normalization
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
     * Supports Microsoft Graph rows:
     *
     * {
     *   fields: {
     *     field_1: "...",
     *     field_2: "..."
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
      const parsed =
        JSON.parse(text);

      const parsedText =
        extractTextValue(parsed);

      if (parsedText) {
        return parsedText;
      }
    } catch {
      /*
       * Normal text.
       */
    }

    return text;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }

    return extractTextValue(
      value[0]
    );
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
          !key.endsWith(
            "@odata.type"
          ) &&
          entryValue !== null &&
          entryValue !== undefined
      );

    if (
      usableEntries.length === 1
    ) {
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
    .replace(
      /_x[0-9a-f]{4}_/gi,
      ""
    )
    .replace(/[\s_-]+/g, "");
}

function sameText(left, right) {
  return (
    normalizeText(left) ===
    normalizeText(right)
  );
}

function getField(
  row,
  possibleNames
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return undefined;
  }

  /*
   * Exact field-name match.
   */
  for (
    const name
    of possibleNames
  ) {
    if (
      Object.prototype
        .hasOwnProperty.call(
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
  const rowKeys =
    Object.keys(row);

  for (
    const expectedName
    of possibleNames
  ) {
    const expectedNormalized =
      normalizeText(
        expectedName
      );

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
   Dates
   ========================================================= */

function getRowDate(row) {
  const value = getField(
    row,
    [
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
       * Hedge Positions:
       * field_8 = AsOfDate
       */
      "field_8",

      /*
       * Physical Positions date.
       */
      "field_10",
      "field_11",
    ]
  );

  return normalizeDate(value);
}

function normalizeDate(value) {
  const rawValue =
    extractTextValue(value);

  if (!rawValue) {
    return "";
  }

  /*
   * ISO date:
   * 2026-07-22
   * 2026-07-22T00:00:00Z
   */
  const isoMatch =
    rawValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (isoMatch) {
    return (
      `${isoMatch[1]}-` +
      `${isoMatch[2]}-` +
      `${isoMatch[3]}`
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
      dayFirstMatch[1]
        .padStart(2, "0");

    const month =
      dayFirstMatch[2]
        .padStart(2, "0");

    const year =
      dayFirstMatch[3];

    return `${year}-${month}-${day}`;
  }

  const parsed =
    new Date(rawValue);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "";
  }

  const year =
    parsed.getUTCFullYear();

  const month = String(
    parsed.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    parsed.getUTCDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function collectSourceDates(rows) {
  const dateSet =
    new Set();

  rows.forEach((row) => {
    const date =
      getRowDate(row);

    if (date) {
      dateSet.add(date);
    }
  });

  /*
   * Newest first.
   */
  return Array.from(
    dateSet
  ).sort(
    (left, right) =>
      right.localeCompare(left)
  );
}

function findCommonDates(
  physicalDates,
  hedgeDates
) {
  const hedgeDateSet =
    new Set(hedgeDates);

  return physicalDates
    .filter((date) =>
      hedgeDateSet.has(date)
    )
    .sort(
      (left, right) =>
        right.localeCompare(left)
    );
}

/* =========================================================
   SharePoint source-field mappings
   ========================================================= */

function getCommodity(row) {
  return extractTextValue(
    getField(row, [
      "Commodity",
      "CommodityName",
      "Commodity Name",
      "Commodity_x0020_Name",

      /*
       * Hedge Positions and Risk Limits.
       */
      "field_1",

      /*
       * Physical Positions.
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
       * Hedge Positions:
       * field_7 = Site
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
       * Risk Limits:
       * field_2 = Site
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
       * Risk Limits:
       * field_3 = LimitType
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
         * Risk Limits:
         * field_4 = LimitValue
         */
        "field_4",
      ])
    ),
    2
  );
}

/* =========================================================
   Exposure keys
   ========================================================= */

function isAggregateSite(value) {
  return sameText(
    value,
    "ALL"
  );
}

function buildExposureKeys({
  physicalPositions,
  hedgePositions,
  riskLimits,
}) {
  const keyMap =
    new Map();

  function addKey(
    commodity,
    siteOrOrigin
  ) {
    const cleanCommodity =
      extractTextValue(
        commodity
      );

    const cleanSite =
      extractTextValue(
        siteOrOrigin
      );

    /*
     * All is a total, not a real location.
     */
    if (
      !cleanCommodity ||
      !cleanSite ||
      isAggregateSite(
        cleanSite
      )
    ) {
      return;
    }

    const key =
      `${normalizeText(
        cleanCommodity
      )}|${normalizeText(
        cleanSite
      )}`;

    if (!keyMap.has(key)) {
      keyMap.set(key, {
        commodity:
          cleanCommodity,

        siteOrOrigin:
          cleanSite,
      });
    }
  }

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
   * Aggregate All limits are excluded.
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
   Site-level calculations
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

  const physicalMT =
    round(
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
           * Physical quantity.
           */
          "field_5",
        ]
      ),
      2
    );

  const hedgeMT =
    round(
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
           * Hedge Positions:
           * field_4 = Quantity
           */
          "field_4",
        ]
      ),
      2
    );

  /*
   * Hedge values are expected to already be negative.
   */
  const netMT =
    round(
      physicalMT +
        hedgeMT,
      2
    );

  const physicalMTM =
    sumRows(
      matchingPhysicalRows,
      [
        "MTMValue",
        "MTM Value",
        "MTM_x0020_Value",

        "NetMTM",
        "Net MTM",

        /*
         * Physical MTM.
         */
        "field_8",
      ]
    );

  const hedgeMTM =
    sumRows(
      matchingHedgeRows,
      [
        "MTMValue",
        "MTM Value",
        "MTM_x0020_Value",

        "NetMTM",
        "Net MTM",

        /*
         * Hedge Positions:
         * field_6 = MTM
         */
        "field_6",
      ]
    );

  const netMTM =
    round(
      physicalMTM +
        hedgeMTM,
      2
    );

  const limitRow =
    matchingLimitRows[0] ||
    null;

  const limitAmount =
    getLimitAmount(
      limitRow
    );

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

    physicalMT,
    hedgeMT,
    netMT,
    netMTM,

    limitAmount,
    utilizationPct,
    status,

    isCommodityTotal:
      false,
  };
}

/* =========================================================
   Commodity Total calculations
   ========================================================= */

function buildCommodityTotalRows({
  siteRows,
  resolvedDate,
  netExposureLimits,
}) {
  const commodityMap =
    new Map();

  siteRows.forEach((row) => {
    const key =
      normalizeText(
        row.commodity
      );

    if (
      !commodityMap.has(key)
    ) {
      commodityMap.set(
        key,
        {
          commodity:
            row.commodity,

          rows: [],
        }
      );
    }

    commodityMap
      .get(key)
      .rows
      .push(row);
  });

  return Array.from(
    commodityMap.values()
  ).map(
    ({ commodity, rows }) => {
      const physicalMT =
        round(
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

      const hedgeMT =
        round(
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

      const netMT =
        round(
          physicalMT +
            hedgeMT,
          2
        );

      const netMTM =
        round(
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
       * If no All limit exists,
       * sum all site-level limits.
       */
      if (limitAmount <= 0) {
        limitAmount =
          round(
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

        physicalMT,
        hedgeMT,
        netMT,
        netMTM,

        limitAmount,
        utilizationPct,
        status,

        isCommodityTotal:
          true,
      };
    }
  );
}

/* =========================================================
   Numbers and status
   ========================================================= */

function toNumber(value) {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value
    )
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

  return Number.isFinite(
    number
  )
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
      toNumber(
        limitAmount
      )
    );

  if (
    numericLimit <= 0
  ) {
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

  if (
    utilization >= 100
  ) {
    return "Breach";
  }

  if (
    utilization >= 70
  ) {
    return "Watch";
  }

  return "OK";
}

/* =========================================================
   Output formatting
   ========================================================= */

function buildSnapshotId(
  resolvedDate,
  sequence
) {
  const compactDate =
    resolvedDate.replace(
      /-/g,
      ""
    );

  const sequenceText =
    String(sequence)
      .padStart(2, "0");

  return (
    `SNP-${compactDate}-` +
    sequenceText
  );
}

function sortSiteRows(rows) {
  const commodityOrder = {
    rawsugar: 1,
    whitesugar: 2,
    palmoil: 3,
  };

  const siteOrder = {
    jeddah: 1,
    egypt: 2,
    indonesia: 3,
    malaysia: 4,
  };

  return [...rows].sort(
    (left, right) => {
      const commodityDifference =
        (
          commodityOrder[
            normalizeText(
              left.commodity
            )
          ] || 99
        ) -
        (
          commodityOrder[
            normalizeText(
              right.commodity
            )
          ] || 99
        );

      if (
        commodityDifference !== 0
      ) {
        return commodityDifference;
      }

      return (
        (
          siteOrder[
            normalizeText(
              left.siteOrOrigin
            )
          ] || 99
        ) -
        (
          siteOrder[
            normalizeText(
              right.siteOrOrigin
            )
          ] || 99
        )
      );
    }
  );
}

function sortCommodityRows(rows) {
  const commodityOrder = {
    rawsugar: 1,
    whitesugar: 2,
    palmoil: 3,
  };

  return [...rows].sort(
    (left, right) =>
      (
        commodityOrder[
          normalizeText(
            left.commodity
          )
        ] || 99
      ) -
      (
        commodityOrder[
          normalizeText(
            right.commodity
          )
        ] || 99
      )
  );
}
