/*
 * 역할:
 * - 이벤트오더 엑셀에서 행사 기본정보, Schedule, Items, Beverages, Lay out & EQP, Others를 추출한다.
 *
 * 왜 분리했는지:
 * - 이벤트오더 양식은 호텔 운영 중 가장 자주 바뀔 수 있는 도메인 규칙이다.
 * - 화면 렌더링, Supabase 저장, AI 호출과 섞어두면 엑셀 양식 하나를 고칠 때 전체 앱을 건드리게 된다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - utils.js의 cleanValue, normalizeLabel 같은 텍스트 정리 함수를 받아 사용한다.
 * - constants.js의 knownSectionAliases를 받아 섹션 제목 경계를 판단한다.
 * - event-order-preview.html은 이 파일의 extractEventOrderInfo 결과를 화면/저장/AI 분석에 그대로 사용한다.
 *
 * 향후 추가 예정:
 * - 객실 행사오더, 식음 발주서, 시설 작업지시서처럼 다른 호텔 문서 양식도 같은 방식의 parser 모듈로 확장할 수 있다.
 */
(function registerBanquetErpEventOrder() {
  /*
   * 왜 이 함수를 만들었는지:
   * - 이벤트오더 추출 규칙을 하나의 서비스로 묶어 HTML 앱 스크립트와 느슨하게 연결하기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - 엑셀 추출은 화면을 직접 그리는 일이 아니라 업무 문서를 구조화 데이터로 바꾸는 도메인 처리다.
   *
   * 실무 설계 이유:
   * - parser를 독립시키면 샘플 엑셀을 기준으로 단위 테스트를 만들 수 있고, UI 개편과 무관하게 추출 품질을 개선할 수 있다.
   */
  function createEventOrderService({ constants, helpers }) {
    const { knownSectionAliases } = constants;
    const { cleanValue, normalizeLabel, escapeRegExp, splitEditorLines, normalizeMealTypes } = helpers;

    /*
     * 왜 이 함수를 만들었는지:
     * - 엑셀 시트 배열에서 행사 기본정보, 스케줄, 아이템, 섹션 메모를 하나의 이벤트오더 데이터로 만들기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 화면이 필요한 원본 데이터 형태를 가장 먼저 만드는 핵심 도메인 함수다.
     *
     * 실무 설계 이유:
     * - 호텔 이벤트오더 양식은 계속 바뀔 수 있으므로 추출 규칙은 화면/저장/AI 코드와 분리해서 관리해야 한다.
     */
    function extractEventOrderInfo(sheets) {
      const extracted = {
        eventName: findFixedRowValue(sheets, "행사명(Name of Event)"),
        host: findFixedRowValue(sheets, "행사주최(Name of Company)"),
        eventDate: findFixedRowValue(sheets, "행사일시(Date / Time)"),
        place: findFixedRowValue(sheets, "장소(Venue)"),
        schedule: extractScheduleRows(sheets),
        items: extractItems(sheets),
        beveragesText: extractNamedSectionText(sheets, ["Beverages", "BEV"]),
        layoutEqpText: extractNamedSectionText(sheets, ["Lay out & EQP", "Lay out", "Layout", "Layout & EQP", "Layout & Equipment", "EQP"]),
        othersText: extractNamedSectionText(sheets, ["Others"]),
        layout: [],
        others: [],
      };
      extracted.layout = splitEditorLines(extracted.layoutEqpText || extractSectionColumnValues(sheets, "Lay out & EQP", "Others").join("\n"));
      extracted.others = splitEditorLines(extracted.othersText || extractSectionColumnValues(sheets, "Others", "시설(Engineering)").join("\n"));
      return {
        ...extracted,
        eventName: extracted.eventName || findFallbackDColumnValue(sheets, ["행사명"], "행사명 D열"),
        host: extracted.host || findFallbackDColumnValue(sheets, ["행사주관", "행사주최"], "행사주관 D열"),
        eventDate: extracted.eventDate || findFallbackDColumnValue(sheets, ["행사일시"], "행사일시 D열"),
        place: extracted.place || findFallbackDColumnValue(sheets, ["장소"], "장소 D열"),
      };
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 표준 이벤트오더 양식의 고정 라벨 행에서 D열 값을 안전하게 찾기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 기본정보 추출은 이벤트오더 parser의 가장 앞단 규칙이다.
     *
     * 실무 설계 이유:
     * - 특정 셀 주소에만 의존하지 않고 라벨을 먼저 찾으면 행 위치가 조금 바뀌어도 추출이 유지된다.
     */
    function findFixedRowValue(sheets, label) {
      const normalizedLabel = normalizeLabel(label);
      for (const sheet of sheets) {
        for (const row of sheet.rows) {
          const hasLabel = (row || []).some((cell) => normalizeLabel(cell) === normalizedLabel);
          if (hasLabel) return cleanValue(row?.[3]);
        }
      }
      return "";
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 예외 양식처럼 A열 라벨과 D열 값 구조를 가진 파일도 읽기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - fallback 규칙은 기본 parser 실패 시 같은 도메인 안에서 이어져야 한다.
     *
     * 실무 설계 이유:
     * - 운영 문서는 양식 변형이 잦으므로, 실패 시 어떤 라벨을 못 찾았는지도 console.warn으로 남겨야 추적이 쉽다.
     */
    function findFallbackDColumnValue(sheets, labels, warningLabel) {
      for (const sheet of sheets) {
        for (const row of sheet.rows) {
          const firstCell = normalizeLabel(row?.[0]);
          if (!firstCell) continue;
          const hasLabel = labels.some((label) => firstCell.includes(normalizeLabel(label)));
          if (!hasLabel) continue;
          const value = cleanValue(row?.[3]);
          if (value) return value;
        }
      }
      console.warn(`fallback extraction failed: ${warningLabel}을 찾지 못했습니다.`);
      return "";
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Schedule 표가 고정 14행 양식과 헤더 탐색 양식 모두에서 추출되도록 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - Schedule은 이벤트오더 분석과 캘린더 저장의 핵심 구조 데이터다.
     *
     * 실무 설계 이유:
     * - 시작 행이 다른 예외 파일이 들어와도 parser 내부 fallback으로 흡수해야 저장/AI 기능이 흔들리지 않는다.
     */
    function extractScheduleRows(sheets) {
      for (const sheet of sheets) {
        const headerIndex = findScheduleHeaderRowIndex(sheet.rows);
        if (headerIndex >= 0 && headerIndex < 12) {
          const fallbackRows = readScheduleRowsAfterHeader(sheet.rows, headerIndex);
          if (fallbackRows.length > 0) return fallbackRows;
        }
        const scheduleRows = readFixedScheduleRows(sheet.rows);
        if (scheduleRows.length > 0) return scheduleRows;
        if (headerIndex >= 0) {
          const fallbackRows = readScheduleRowsAfterHeader(sheet.rows, headerIndex);
          if (fallbackRows.length > 0) return fallbackRows;
        }
      }
      return extractFallbackScheduleRows(sheets);
    }

    function readFixedScheduleRows(rows) {
      const scheduleRows = [];
      let blankStreak = 0;
      let currentDate = "";
      const startRowIndex = 13;
      const dateColIndex = 0;
      const timeColIndex = 1;
      const contentColIndex = 2;
      const venueColIndex = 4;
      const peopleColIndex = 6;

      for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        if (rowHasMarkerInColumns(row, "Items", 0, 9)) break;

        const rowDate = cleanValue(row[dateColIndex]);
        if (rowDate) currentDate = rowDate;

        const item = {
          date: currentDate,
          time: cleanValue(row[timeColIndex]),
          content: cleanValue(row[contentColIndex]),
          venue: cleanValue(row[venueColIndex]),
          people: cleanValue(row[peopleColIndex]),
        };

        if (isScheduleRowEmpty(item)) {
          blankStreak += 1;
          if (blankStreak >= 6 && scheduleRows.length > 0) break;
          continue;
        }

        blankStreak = 0;
        scheduleRows.push(item);
      }

      return scheduleRows;
    }

    function isScheduleRowEmpty(item) {
      return !item.time && !item.content && !item.venue && !item.people;
    }

    function extractFallbackScheduleRows(sheets) {
      for (const sheet of sheets) {
        const headerIndex = findScheduleHeaderRowIndex(sheet.rows);
        if (headerIndex < 0) continue;
        const scheduleRows = readScheduleRowsAfterHeader(sheet.rows, headerIndex);
        if (scheduleRows.length > 0) return scheduleRows;
      }
      console.warn("fallback extraction failed: Schedule 헤더 또는 시간/내용/장소/인원 헤더를 찾지 못했습니다.");
      return [];
    }

    function findScheduleHeaderRowIndex(rows) {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        if (isScheduleHeaderRow(row)) return rowIndex;
        if (rowHasMarker(row, "Schedule")) {
          for (let nextIndex = rowIndex + 1; nextIndex <= Math.min(rowIndex + 5, rows.length - 1); nextIndex += 1) {
            if (isScheduleHeaderRow(rows[nextIndex] || [])) return nextIndex;
          }
        }
      }
      return -1;
    }

    function isScheduleHeaderRow(row) {
      const timeHeader = normalizeLabel(row?.[1]).includes(normalizeLabel("시간"));
      const contentHeader = normalizeLabel(row?.[2]).includes(normalizeLabel("내용"));
      const venueHeader = normalizeLabel(row?.[4]).includes(normalizeLabel("장소"));
      const peopleHeader = normalizeLabel(row?.[6]).includes(normalizeLabel("인원"));
      return timeHeader && contentHeader && venueHeader && peopleHeader;
    }

    function readScheduleRowsAfterHeader(rows, headerIndex) {
      const scheduleRows = [];
      let currentDate = "";
      let blankStreak = 0;
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        if (rowHasMarkerInColumns(row, "Items", 0, 9)) break;

        const rowDate = cleanValue(row[0]);
        if (rowDate) currentDate = rowDate;
        const item = {
          date: currentDate,
          time: cleanValue(row[1]),
          content: cleanValue(row[2]),
          venue: cleanValue(row[4]),
          people: cleanValue(row[6]),
        };

        if (isScheduleRowEmpty(item)) {
          blankStreak += 1;
          if (blankStreak >= 6 && scheduleRows.length > 0) break;
          continue;
        }

        blankStreak = 0;
        scheduleRows.push(item);
      }

      if (!scheduleRows.length) {
        console.warn(`fallback extraction failed: Schedule 데이터 행을 찾지 못했습니다. headerRow=${headerIndex + 1}`);
      }
      return scheduleRows;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Items 섹션에서 항목명, 단가, 수량, 금액을 구조화하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - Items는 매출/식음/기물 분석의 원천 데이터라 이벤트오더 parser에서 함께 추출해야 한다.
     *
     * 실무 설계 이유:
     * - 테이블 행 단위로 구조화해두면 나중에 월별 매출, 식사유형 통계, AI 분석에 재사용할 수 있다.
     */
    function extractItems(sheets) {
      for (const sheet of sheets) {
        const startIndex = findRowIndex(sheet.rows, "Items");
        if (startIndex < 0) continue;

        const items = [];
        for (let rowIndex = startIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex] || [];
          if (rowHasMarker(row, "예상 매출(Expected Revenue)")) break;

          const item = {
            itemName: cleanValue(row[0]) || cleanValue(row[2]),
            unitPrice: cleanValue(row[3]),
            quantity: cleanValue(row[5]),
            amount: cleanValue(row[6]),
          };
          if (item.unitPrice || item.quantity || item.amount) items.push(item);
        }
        return items;
      }
      return [];
    }

    function extractSectionColumnValues(sheets, startMarker, endMarker) {
      for (const sheet of sheets) {
        const startIndex = findRowIndex(sheet.rows, startMarker);
        if (startIndex < 0) continue;

        const values = [];
        for (let rowIndex = startIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex] || [];
          if (rowHasMarker(row, endMarker)) break;
          const value = cleanValue(row[2]);
          if (value) values.push(value);
        }
        return values;
      }
      return [];
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Beverages, Lay out & EQP, Others처럼 위치가 바뀌는 섹션을 제목 기준으로 추출하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 섹션 텍스트는 뒤집기, 음주류, 필요기물 분석에 직접 연결되는 이벤트오더 도메인 데이터다.
     *
     * 실무 설계 이유:
     * - 고정 셀보다 섹션 제목 탐색 방식이 운영 문서 변형에 강하고, 첫 줄 누락 같은 오류를 줄인다.
     */
    function extractNamedSectionText(sheets, aliases) {
      for (const sheet of sheets) {
        const start = findSectionStart(sheet.rows, aliases);
        if (!start) continue;

        const lines = [];
        for (let rowIndex = start.rowIndex; rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex] || [];
          if (rowIndex > start.rowIndex && hasKnownSectionTitle(row)) break;

          const startCol = rowIndex === start.rowIndex ? start.colIndex + 1 : 0;
          const inlineValue = rowIndex === start.rowIndex ? getInlineSectionValue(row[start.colIndex], aliases) : "";
          const sourceCells = rowIndex === start.rowIndex
            ? row.map((value, colIndex) => colIndex === start.colIndex ? inlineValue : value).slice(startCol)
            : row;
          const values = sourceCells
            .map(cleanValue)
            .filter(Boolean)
            .filter((value) => !isOnlySectionTitle(value) && !matchesAnySectionAlias(value, aliases));
          if (inlineValue) values.unshift(inlineValue);
          if (values.length) lines.push(values.join(" "));
        }

        const text = lines.join("\n").trim();
        if (text) return text;
        console.warn(`section extraction warning: ${aliases.join("/")} 섹션은 찾았지만 내용이 비어 있습니다.`);
        return "";
      }

      console.warn(`section extraction warning: ${aliases.join("/")} 섹션 제목을 찾지 못했습니다.`);
      return "";
    }

    function findSectionStart(rows, aliases) {
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
          const cell = cleanValue(row[colIndex]);
          if (matchesAnySectionAlias(cell, aliases)) {
            return { rowIndex, colIndex };
          }
        }
      }
      return null;
    }

    function hasKnownSectionTitle(row) {
      return (row || []).some((cell) => isLikelySectionTitle(cell));
    }

    function isOnlySectionTitle(value) {
      const normalized = normalizeLabel(value);
      return knownSectionAliases.some((alias) => normalized === normalizeLabel(alias));
    }

    function isLikelySectionTitle(value) {
      const normalized = normalizeLabel(value);
      if (!normalized) return false;
      return knownSectionAliases.some((alias) => {
        const normalizedAlias = normalizeLabel(alias);
        return normalized === normalizedAlias
          || (normalized.includes(normalizedAlias) && normalized.length <= normalizedAlias.length + 14);
      });
    }

    function matchesAnySectionAlias(value, aliases) {
      const normalized = normalizeLabel(value);
      if (!normalized) return false;
      return aliases.some((alias) => normalized.includes(normalizeLabel(alias)));
    }

    function getInlineSectionValue(value, aliases) {
      const text = cleanValue(value);
      if (!text) return "";
      for (const alias of aliases) {
        const pattern = new RegExp(`${escapeRegExp(alias)}\\s*[:>]?\\s*(.*)$`, "i");
        const match = text.match(pattern);
        const inlineValue = cleanValue(match?.[1]);
        if (inlineValue && normalizeLabel(inlineValue) !== normalizeLabel(alias)) return inlineValue;
      }
      return "";
    }

    function findRowIndex(rows, marker) {
      return rows.findIndex((row) => rowHasMarker(row, marker));
    }

    function rowHasMarker(row, marker) {
      const normalizedMarker = normalizeLabel(marker);
      return (row || []).some((cell) => normalizeLabel(cell).includes(normalizedMarker));
    }

    function rowHasMarkerInColumns(row, marker, startColIndex, endColIndex) {
      const normalizedMarker = normalizeLabel(marker);
      return (row || [])
        .slice(startColIndex, endColIndex + 1)
        .some((cell) => normalizeLabel(cell).includes(normalizedMarker));
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Schedule과 Items 텍스트에서 식사유형 키워드를 자동 감지하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 식사유형은 이벤트오더 추출 결과에서 파생되는 구조화 키워드다.
     *
     * 실무 설계 이유:
     * - 질문형 AI 통계가 정확해지려면 저장 시점에 meal_types를 정규화해두는 편이 검색/분석에 유리하다.
     */
    function detectMealTypes(eventItem) {
      const detected = new Set();
      const scheduleRows = Array.isArray(eventItem?.schedule) ? eventItem.schedule : [];
      scheduleRows.forEach((row) => {
        if (isFlorenceVenue(row.venue)) return;
        addMealTypesFromText(detected, `${row.content || ""} ${row.venue || ""}`);
      });
      const itemRows = Array.isArray(eventItem?.items) ? eventItem.items : [];
      itemRows.forEach((item) => {
        addMealTypesFromText(detected, `${item.itemName || item.name || ""} ${item.unitPrice || ""} ${item.quantity || ""}`);
      });
      addMealTypesFromText(detected, eventItem?.beveragesText || "");
      return normalizeMealTypes([...detected]);
    }

    function addMealTypesFromText(target, sourceText) {
      const text = cleanValue(sourceText);
      if (!text) return;
      if (/(조식|breakfast)/i.test(text)) target.add("breakfast");
      if (/(커피\s*브레이크|커피브레이크|coffee\s*break)/i.test(text)) target.add("coffee_break");
      if (/(티\s*브레이크|티브레이크|tea\s*break)/i.test(text)) target.add("tea_break");
      if (/((중식|런치|lunch)[\s\/-]*(뷔페|buffet)|(뷔페|buffet)[\s\/-]*(중식|런치|lunch))/i.test(text)) target.add("lunch_buffet");
      if (/((석식|디너|dinner)[\s\/-]*(뷔페|buffet)|(뷔페|buffet)[\s\/-]*(석식|디너|dinner))/i.test(text)) target.add("dinner_buffet");
      if (/(양식코스|양식|웨스턴|western\s*course|western|course)/i.test(text)) target.add("western_course");
      if (/(도시락|lunch\s*box|lunchbox)/i.test(text)) target.add("lunch_box");
    }

    function isFlorenceVenue(value) {
      const normalized = cleanValue(value).toLowerCase().replace(/\s+/g, "");
      return normalized.includes("피렌체") || normalized.includes("florence");
    }

    return {
      extractEventOrderInfo,
      detectMealTypes,
    };
  }

  window.BANQUET_ERP_EVENT_ORDER = {
    createEventOrderService,
  };
})();
