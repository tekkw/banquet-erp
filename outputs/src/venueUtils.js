(function registerVenueUtils(global) {
  const GROUP_MEMBERS = {
    CONVENTION_AB: ["CONVENTION_A", "CONVENTION_B"],
    BURANO_ALL: ["BURANO_1", "BURANO_2", "BURANO_3"],
    CAPRI_ALL: ["CAPRI_1", "CAPRI_2", "CAPRI_3"],
  };
  const ATOMIC_MEMBERS = {
    CONVENTION_A: ["CONVENTION_1", "CONVENTION_2"],
    CONVENTION_B: ["CONVENTION_3"],
    CONVENTION_AB: ["CONVENTION_1", "CONVENTION_2", "CONVENTION_3"],
    BURANO_ALL: ["BURANO_1", "BURANO_2", "BURANO_3"],
    CAPRI_ALL: ["CAPRI_1", "CAPRI_2", "CAPRI_3"],
  };
  const SHORT_LABELS = { CONVENTION_A: "컨A", CONVENTION_B: "컨B", CONVENTION_AB: "컨AB", BURANO_1: "부1", BURANO_2: "부2", BURANO_3: "부3", BURANO_ALL: "부ALL", CAPRI_1: "카1", CAPRI_2: "카2", CAPRI_3: "카3", CAPRI_ALL: "카ALL", FESTA: "페스타", OLIVIA: "올리" };
  const VENUE_MASTER = [
    { code: "CONVENTION_A", label: "컨벤션A", shortLabel: "컨A", group: "컨벤션", aliases: ["컨벤션 A", "컨벤션센터 A", "CONVENTION A"] },
    { code: "CONVENTION_B", label: "컨벤션B", shortLabel: "컨B", group: "컨벤션", aliases: ["컨벤션 B", "컨벤션센터 B", "CONVENTION B"] },
    { code: "CONVENTION_AB", label: "컨벤션AB", shortLabel: "컨AB", group: "컨벤션", aliases: ["컨벤션", "컨벤션 전체", "컨벤션센터", "CONVENTION AB"] },
    { code: "BURANO_1", label: "부라노1", shortLabel: "부1", group: "부라노", aliases: ["부라노 I", "BURANO I"] },
    { code: "BURANO_2", label: "부라노2", shortLabel: "부2", group: "부라노", aliases: ["부라노 II", "BURANO II"] },
    { code: "BURANO_3", label: "부라노3", shortLabel: "부3", group: "부라노", aliases: ["부라노 III", "BURANO III"] },
    { code: "BURANO_ALL", label: "부라노전체", shortLabel: "부ALL", group: "부라노", aliases: ["부라노", "부라노 전체", "부라노 I+II+III", "BURANO ALL"] },
    { code: "CAPRI_1", label: "카프리1", shortLabel: "카1", group: "카프리", aliases: ["카프리 I", "CAPRI I"] },
    { code: "CAPRI_2", label: "카프리2", shortLabel: "카2", group: "카프리", aliases: ["카프리 II", "CAPRI II"] },
    { code: "CAPRI_3", label: "카프리3", shortLabel: "카3", group: "카프리", aliases: ["카프리 III", "CAPRI III"] },
    { code: "CAPRI_ALL", label: "카프리전체", shortLabel: "카ALL", group: "카프리", aliases: ["카프리", "카프리 전체", "카프리 I+II+III", "CAPRI ALL"] },
    { code: "FESTA", label: "페스타", shortLabel: "페스타", group: "기타", aliases: ["FESTA"] },
    { code: "OLIVIA", label: "올리비아", shortLabel: "올리", group: "기타", aliases: ["OLIVIA"] },
  ];

  function prepareVenueText(value) {
    return String(value || "").trim().toUpperCase()
      .replace(/^\s*[123]\s*(?:F|층)\s*/i, "")
      .replace(/(^|[\s,，/&·ㆍ])(?:[123]\s*(?:F|층))(?=$|[\s,，/+&·ㆍ])/gi, "$1")
      .replace(/[Ⅲⅲ]/g, "3").replace(/[Ⅱⅱ]/g, "2").replace(/[Ⅰⅰ]/g, "1")
      .replace(/\bIII\b/g, "3").replace(/\bII\b/g, "2").replace(/\bI\b/g, "1")
      .replace(/\s+/g, " ").trim();
  }
  function comparable(value) {
    return prepareVenueText(value).replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "");
  }
  function normalizeVenue(value) {
    const canonicalCode = String(value || "").trim().toUpperCase();
    if (VENUE_MASTER.some((item) => item.code === canonicalCode)) return canonicalCode;
    const name = comparable(value).replace(/CONVENTION/g, "컨벤션").replace(/컨벤션센터/g, "컨벤션").replace(/BURANO/g, "부라노").replace(/CAPRI/g, "카프리").replace(/FESTA/g, "페스타").replace(/OLIVIA/g, "올리비아");
    if (/^(컨벤션(?:전체|ALL|AB)|컨AB)$/.test(name) || /^컨벤션(?:A\+B|1\+2\+3|123)$/.test(name)) return "CONVENTION_AB";
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
    if (/^페스타$/.test(name)) return "FESTA";
    if (/^올리비아$/.test(name)) return "OLIVIA";
    return "";
  }
  function normalizeVenueResult(value) {
    const raw = String(value ?? "");
    return { canonical: normalizeVenue(raw) || null, raw };
  }
  function atoms(code) { return new Set(ATOMIC_MEMBERS[code] || (code ? [code] : [])); }
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
  function normalizeVenueList(value) {
    const text = prepareVenueText(value);
    const canonicalCode = text.trim().toUpperCase();
    if (VENUE_MASTER.some((item) => item.code === canonicalCode)) return [canonicalCode];
    const pattern = /CONVENTION_(?:AB|A|B)|BURANO_(?:ALL|1|2|3)|CAPRI_(?:ALL|1|2|3)|(?:컨벤션(?:센터)?|CONVENTION)\s*(?:A\s*\+\s*B|1\s*\+\s*2\s*\+\s*3|AB|전체|ALL|A|B|1|2|3)?|컨\s*(?:AB|A|B)|(?:부라노|BURANO)\s*(?:1\s*\+\s*2\s*\+\s*3|123|전체|ALL|1|2|3)?|(?:카프리|CAPRI)\s*(?:1\s*\+\s*2\s*\+\s*3|123|전체|ALL|1|2|3)?|(?:페스타|FESTA)|(?:올리비아|OLIVIA)/gi;
    const codes = [...text.matchAll(pattern)].map((match) => normalizeVenue(match[0])).filter(Boolean);
    return collapseCodes(codes.length ? codes : [normalizeVenue(text)].filter(Boolean));
  }
  function parseVenueCodes(value) { return normalizeVenueList(value); }
  function normalizeVenueSet(value) {
    const result = new Set();
    normalizeVenueList(value).forEach((code) => atoms(code).forEach((atom) => result.add(atom)));
    return result;
  }
  function spacesOverlap(left, right) {
    const leftSet = normalizeVenueSet(left); const rightSet = normalizeVenueSet(right);
    return leftSet.size > 0 && rightSet.size > 0 && [...leftSet].some((space) => rightSet.has(space));
  }
  function venueSearchKey(value) { return String(value || "").toLocaleLowerCase().replace(/\s+/g, ""); }
  function buildVenueOptions(query = "") {
    const search = venueSearchKey(query);
    if (!search) return VENUE_MASTER.map((item) => ({ ...item, aliases: [...item.aliases] }));
    const normalizedQuery = normalizeVenue(query);
    if (normalizedQuery) return VENUE_MASTER.filter((item) => item.code === normalizedQuery).map((item) => ({ ...item, aliases: [...item.aliases] }));
    const searchable = VENUE_MASTER.map((item) => ({ item, keys: [item.label, item.shortLabel, ...item.aliases].map(venueSearchKey) }));
    const exact = searchable.filter(({ keys }) => keys.includes(search));
    return (exact.length ? exact : searchable.filter(({ keys }) => keys.some((key) => key.includes(search))))
      .map(({ item }) => ({ ...item, aliases: [...item.aliases] }));
  }
  function venueLabel(value) { const code = VENUE_MASTER.some((item) => item.code === value) ? value : normalizeVenue(value); return VENUE_MASTER.find((item) => item.code === code)?.label || ""; }
  function formatVenueShort(value) { const codes = normalizeVenueList(value); if (codes.length > 1) return codes.map((code) => SHORT_LABELS[code]).filter(Boolean).join("+"); const code = codes[0] || normalizeVenue(value); return SHORT_LABELS[code] || String(value || "").replace(/^\s*\d+\s*(?:F|층)\s*/i, "").trim() || "장소 미정"; }
  function formatVenueShortList(values) {
    const labels = collapseCodes(values).map((code) => SHORT_LABELS[code]);
    if (!labels.length) return formatVenueShort((values || [])[0]);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join("+");
    return `${labels[0]} 외 ${labels.length - 1}`;
  }

  global.BANQUET_ERP_VENUE_UTILS = { normalizeVenue, normalizeVenueResult, normalizeVenueList, normalizeVenueSet, spacesOverlap, formatVenueShort, formatVenueShortList, collapseCodes, parseVenueCodes, buildVenueOptions, venueLabel, venueSearchKey };
})(typeof window !== "undefined" ? window : globalThis);
