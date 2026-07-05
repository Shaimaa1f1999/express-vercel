export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const ekaRows = req.body?.eka_rows;
    const comscoRows = req.body?.comsco_rows;

    if (!Array.isArray(ekaRows) || !Array.isArray(comscoRows)) {
      return res.status(400).json({
        error: "eka_rows and comsco_rows are required and must be arrays."
      });
    }

    const compareFields = ["Quantity", "Price", "Currency", "Exposure"];

    const normalizeText = (v) => {
      if (v === null || v === undefined) return "";
      return String(v).trim();
    };

    const normalizeNumber = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(String(v).replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : String(v).trim();
    };

    const normalizeForCompare = (field, value) => {
      if (["Quantity", "Price", "Exposure"].includes(field)) {
        return normalizeNumber(value);
      }
      return normalizeText(value).toUpperCase();
    };

    const toMap = (rows) => {
      const map = new Map();
      const duplicates = [];

      for (const row of rows) {
        const tradeId = normalizeText(row.TradeID);
        if (!tradeId) continue;

        if (map.has(tradeId)) {
          duplicates.push({ TradeID: tradeId, row });
        } else {
          map.set(tradeId, row);
        }
      }

      return { map, duplicates };
    };

    const eka = toMap(ekaRows);
    const comsco = toMap(comscoRows);

    const missingInCOMSCO = [];
    const missingInEKA = [];
    const fieldMismatches = [];

    for (const [tradeId, ekaRow] of eka.map.entries()) {
      const comscoRow = comsco.map.get(tradeId);

      if (!comscoRow) {
        missingInCOMSCO.push({
          TradeID: tradeId,
          EKA: ekaRow
        });
        continue;
      }

      for (const field of compareFields) {
        const ekaValue = normalizeForCompare(field, ekaRow[field]);
        const comscoValue = normalizeForCompare(field, comscoRow[field]);

        if (ekaValue !== comscoValue) {
          fieldMismatches.push({
            TradeID: tradeId,
            Field: field,
            EKA_Value: ekaRow[field],
            COMSCO_Value: comscoRow[field]
          });
        }
      }
    }

    for (const [tradeId, comscoRow] of comsco.map.entries()) {
      if (!eka.map.has(tradeId)) {
        missingInEKA.push({
          TradeID: tradeId,
          COMSCO: comscoRow
        });
      }
    }

    const result = {
      summary: {
        eka_count: eka.map.size,
        comsco_count: comsco.map.size,
        missing_in_comsco_count: missingInCOMSCO.length,
        missing_in_eka_count: missingInEKA.length,
        mismatch_count: fieldMismatches.length,
        duplicate_eka_count: eka.duplicates.length,
        duplicate_comsco_count: comsco.duplicates.length
      },
      missing_in_comsco: missingInCOMSCO,
      missing_in_eka: missingInEKA,
      field_mismatches: fieldMismatches,
      duplicates: {
        eka: eka.duplicates,
        comsco: comsco.duplicates
      },
      report_text: buildReport({
        missingInCOMSCO,
        missingInEKA,
        fieldMismatches,
        eka,
        comsco
      })
    };

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({
      error: e?.message || "failed"
    });
  }
}

function buildReport({ missingInCOMSCO, missingInEKA, fieldMismatches, eka, comsco }) {
  const lines = [];

  lines.push("Reconciliation Report");
  lines.push("");
  lines.push("Summary");
  lines.push(`- EKA trades: ${eka.map.size}`);
  lines.push(`- COMSCO trades: ${comsco.map.size}`);
  lines.push(`- Missing in COMSCO: ${missingInCOMSCO.length}`);
  lines.push(`- Missing in EKA: ${missingInEKA.length}`);
  lines.push(`- Field mismatches: ${fieldMismatches.length}`);
  lines.push(`- Duplicate EKA TradeIDs: ${eka.duplicates.length}`);
  lines.push(`- Duplicate COMSCO TradeIDs: ${comsco.duplicates.length}`);
  lines.push("");

  if (missingInCOMSCO.length) {
    lines.push("Missing in COMSCO");
    for (const x of missingInCOMSCO) {
      lines.push(`- ${x.TradeID}`);
    }
    lines.push("");
  }

  if (missingInEKA.length) {
    lines.push("Missing in EKA");
    for (const x of missingInEKA) {
      lines.push(`- ${x.TradeID}`);
    }
    lines.push("");
  }

  if (fieldMismatches.length) {
    lines.push("Field Mismatches");
    lines.push("| TradeID | Field | EKA Value | COMSCO Value |");
    lines.push("|---|---|---|---|");
    for (const x of fieldMismatches) {
      lines.push(`| ${x.TradeID} | ${x.Field} | ${x.EKA_Value ?? ""} | ${x.COMSCO_Value ?? ""} |`);
    }
    lines.push("");
  }

  lines.push("Recommended Action");
  lines.push("- Review missing trades first.");
  lines.push("- Validate mismatched commercial fields with the source system owners.");
  lines.push("- Re-run reconciliation after corrections.");

  return lines.join("\n");
}
