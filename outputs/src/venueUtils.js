(function registerVenueUtils(global) {
  const GROUP_MEMBERS = {
    CONVENTION_AB: ["CONVENTION_A", "CONVENTION_B"],
    BURANO_ALL: ["BURANO_1", "BURANO_2", "BURANO_3"],
    CAPRI_ALL: ["CAPRI_1", "CAPRI_2", "CAPRI_3"],
  };
  const SHORT_LABELS = { CONVENTION_A: "컨A", CONVENTION_B: "컨B", CONVENTION_AB: "컨AB", BURANO_1: "부1", BURANO_2: "부2", BURANO_3: "부3", BURANO_ALL: "부ALL", CAPRI_1: "카1", CAPRI_2: "카2", CAPRI_3: "카3", CAPRI_ALL: "카ALL", FESTA: "페스타", OLIVIA: "올리" };

  function comparable(value) {
    return String(value || "").toUpperCase().replace(/[Ⅰⅰ]/g, "1").replace(/[Ⅱⅱ]/g, "2").replace(/[Ⅲⅲ]/g, "3")
      .replace(/^\s*\d+\s*F\s*/i, "").replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "");
  }
  function normalizeVenue(value) {
    const romanName = String(value || "").toUpperCase().replace(/^\s*\d+\s*F\s*/i, "").replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "")
      .replace(/^(부라노|카프리)III$/, (_, family) => `${family}3`).replace(/^(부라노|카프리)II$/, (_, family) => `${family}2`).replace(/^(부라노|카프리)I$/, (_, family) => `${family}1`);
    const name = comparable(romanName).replace(/CONVENTION/g, "컨벤션").replace(/컨벤션센터/g, "컨벤션").replace(/BURANO/g, "부라노").replace(/CAPRI/g, "카프리");
    if (/^(컨벤션(?:전체|ALL|AB)|컨AB)$/.test(name) || /^컨벤션(?:1\+2\+3|123)$/.test(name)) return "CONVENTION_AB";
    if (/^컨벤션$/.test(name)) return "CONVENTION_AB";
    if (/^(컨벤션A|컨A|컨벤션[12])$/.test(name)) return "CONVENTION_A";
    if (/^(컨벤션B|컨B|컨벤션3)$/.test(name)) return "CONVENTION_B";
    if (/^부라노(?:전체|ALL|1\+2\+3|123)?$/.test(name)) return "BURANO_ALL";
    if (/^부라노1$/.test(name)) return "BURANO_1";
    if (/^부라노2$/.test(name)) return "BURANO_2";
    if (/^부라노3$/.test(name)) return "BURANO_3";
    if (/^카프리(?:전체|ALL|1\+2\+3|123)?$/.test(name)) return "CAPRI_ALL";
    if (/^카프리1$/.test(name)) return "CAPRI_1";
    if (/^카프리2$/.test(name)) return "CAPRI_2";
    if (/^카프리3$/.test(name)) return "CAPRI_3";
    if (/페스타/.test(name)) return "FESTA";
    if (/올리비아/.test(name)) return "OLIVIA";
    return "";
  }
  function atoms(code) { return new Set(GROUP_MEMBERS[code] || (code ? [code] : [])); }
  function spacesOverlap(left, right) {
    const leftCode = normalizeVenue(left); const rightCode = normalizeVenue(right);
    if (!leftCode || !rightCode) return false;
    const rightAtoms = atoms(rightCode);
    return [...atoms(leftCode)].some((code) => rightAtoms.has(code));
  }
  function collapseCodes(values) {
    const codes = [...new Set((values || []).map(normalizeVenue).filter(Boolean))];
    for (const [all, members] of Object.entries(GROUP_MEMBERS)) {
      if (codes.includes(all)) { members.forEach((member) => { const index = codes.indexOf(member); if (index >= 0) codes.splice(index, 1); }); continue; }
      if (members.every((member) => codes.includes(member))) {
        members.forEach((member) => codes.splice(codes.indexOf(member), 1)); codes.push(all);
      }
    }
    return codes;
  }
  function formatVenueShort(value) { const code = normalizeVenue(value); return SHORT_LABELS[code] || String(value || "").replace(/^\s*\d+\s*F\s*/i, "").trim() || "장소 미정"; }
  function formatVenueShortList(values) {
    const labels = collapseCodes(values).map((code) => SHORT_LABELS[code]);
    if (!labels.length) return formatVenueShort((values || [])[0]);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join("+");
    return `${labels[0]} 외 ${labels.length - 1}`;
  }

  global.BANQUET_ERP_VENUE_UTILS = { normalizeVenue, spacesOverlap, formatVenueShort, formatVenueShortList, collapseCodes };
})(typeof window !== "undefined" ? window : globalThis);
