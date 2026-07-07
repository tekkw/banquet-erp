/*
 * 역할:
 * - 월간 행사 캘린더를 그리고, 하루 행사/여러 날 행사를 캘린더 바 형태로 표시한다.
 *
 * 왜 분리했는지:
 * - 캘린더는 날짜 계산, 주 단위 overlay, 멀티데이 바, 색상 표시, 클릭 이벤트가 한데 모이는 복잡한 화면이다.
 * - event-order-preview.html 안에 계속 두면 저장/엑셀/AI 코드와 섞여 수정 위험이 커진다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - constants.js의 eventColors를 받아 행사 색상을 표시한다.
 * - utils.js의 formatDateKey 같은 날짜 유틸을 사용한다.
 * - 메인 앱은 현재 월(calendarDate), 저장된 행사(savedEvents), 상세 모달 열기 콜백을 넘겨준다.
 *
 * 향후 추가 예정:
 * - 주간/일간 보기, 드래그 일정 이동, 객실/식음/시설 캘린더를 같은 방식으로 확장할 수 있다.
 */
(function registerBanquetErpEventCalendar() {
  /*
   * 왜 이 함수를 만들었는지:
   * - 캘린더 DOM 요소와 외부 콜백을 하나로 묶어 캘린더 전용 컨트롤러를 만들기 위해 작성했다.
   *
   * 왜 여기 있어야 하는지:
   * - 캘린더 모듈은 행사 데이터 전체 저장 방식은 몰라도, 화면에 어떻게 그릴지는 직접 책임져야 한다.
   *
   * 실무 설계 이유:
   * - 화면 컴포넌트 단위로 컨트롤러를 만들면 모달, 저장, API와 느슨하게 연결되어 테스트와 교체가 쉬워진다.
   */
  function createCalendarController({ elements, constants, helpers, callbacks = {} }) {
    const { calendarTitle, calendarGrid } = elements;
    const { eventColors } = constants;
    const { formatDateKey, normalizeEventColorKey, getEventRenderRange, syncExportDefaults } = helpers;
    const { openEventModal } = callbacks;

    /*
     * 왜 이 함수를 만들었는지:
     * - 저장된 행사 데이터를 월간 캘린더 화면으로 변환하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 날짜 셀, 주 단위 레이어, 멀티데이 행사 바를 실제 DOM으로 만드는 캘린더 모듈의 중심 함수다.
     *
     * 실무 설계 이유:
     * - 캘린더 표시 규칙을 한곳에 모아야 날짜 계산이나 바 디자인을 바꿀 때 다른 업무 로직을 건드리지 않는다.
     */
    function renderCalendar({ calendarDate, savedEvents }) {
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      calendarTitle.textContent = `${year}년 ${month + 1}월`;
      syncExportDefaults?.();
      calendarGrid.innerHTML = "";
      const todayKey = formatDateKey(new Date());

      ["일", "월", "화", "수", "목", "금", "토"].forEach((weekday) => {
        const cell = document.createElement("div");
        cell.className = "weekday";
        cell.textContent = weekday;
        calendarGrid.append(cell);
      });

      const firstDay = new Date(year, month, 1);
      const startDate = new Date(year, month, 1 - firstDay.getDay());
      const calendarCells = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
        return {
          date,
          dateKey: formatDateKey(date),
          isOutside: date.getMonth() !== month,
        };
      });
      const eventRanges = getVisibleCalendarEventRanges(calendarCells, savedEvents);

      for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
        const weekCells = calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7);
        const weekSegments = buildCalendarWeekSegments(weekCells, eventRanges);
        const weekRow = document.createElement("div");
        weekRow.className = "calendar-week";
        const laneCount = weekSegments.reduce((max, segment) => Math.max(max, segment.laneIndex + 1), 0);
        const mobileOverflowByDate = new Map();
        weekCells.forEach(({ date, dateKey }) => {
          const hiddenCount = weekSegments.filter((segment) => segment.laneIndex >= 3 && isDateWithinRange(date, segment.segmentStart, segment.segmentEnd)).length;
          if (hiddenCount > 0) mobileOverflowByDate.set(dateKey, hiddenCount);
        });
        weekRow.style.minHeight = `${Math.max(132, 52 + laneCount * 37)}px`;

        weekCells.forEach(({ date, dateKey, isOutside }) => {
          const dayCell = document.createElement("div");
          dayCell.className = `calendar-day${isOutside ? " outside" : ""}`;
          if (dateKey === todayKey) dayCell.classList.add("today");
          if (weekSegments.some((segment) => isDateWithinRange(date, segment.segmentStart, segment.segmentEnd))) {
            dayCell.classList.add("has-events");
          }

          const dayNumber = document.createElement("div");
          dayNumber.className = "day-number";
          dayNumber.textContent = date.getDate();
          dayCell.append(dayNumber);
          if (mobileOverflowByDate.has(dateKey)) {
            const overflow = document.createElement("span");
            overflow.className = "calendar-overflow-count";
            overflow.textContent = `+${mobileOverflowByDate.get(dateKey)}`;
            dayCell.append(overflow);
          }
          weekRow.append(dayCell);
        });

        const eventLayer = document.createElement("div");
        eventLayer.className = "calendar-event-layer";
        weekSegments.forEach((segment) => {
          eventLayer.append(createCalendarEventBar(segment));
        });
        weekRow.append(eventLayer);
        calendarGrid.append(weekRow);
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 하루 행사와 멀티데이 행사를 같은 디자인의 캘린더 바 요소로 만들기 위해 작성했다.
     *
     * 왜 여기 있어야 하는지:
     * - renderCalendar가 계산한 segment를 실제 DOM으로 바꾸는 보조 함수라서 캘린더 모듈 안에 함께 있어야 한다.
     *
     * 실무 설계 이유:
     * - 이벤트 바 디자인을 한곳에서 만들면 색상, 클릭, 말줄임, 멀티데이 스타일 변경을 일관되게 적용할 수 있다.
     */
    function createCalendarEventBar(segment) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `calendar-event-bar${segment.continuesLeft ? " range-continues-left" : ""}${segment.continuesRight ? " range-continues-right" : ""}`;
      button.style.gridColumn = `${segment.columnStart} / ${segment.columnEnd}`;
      button.style.gridRow = String(segment.laneIndex + 1);
      const color = eventColors[normalizeEventColorKey(segment.eventItem.color)] || eventColors.gray;
      const strip = document.createElement("span");
      strip.className = "event-color-strip";
      strip.style.background = color.dot || color.border;
      const title = document.createElement("span");
      title.className = "event-title";
      title.textContent = segment.eventItem.eventName;
      button.append(strip, title);
      button.style.background = color.background;
      button.style.borderColor = color.border;
      button.style.color = color.text;
      button.addEventListener("click", () => openEventModal?.(segment.eventItem, segment.clickDateKey));
      return button;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 현재 캘린더 화면에 걸치는 행사만 골라 주 단위 렌더링 계산량을 줄이기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 표시 범위 필터링은 캘린더 렌더링의 일부이며 저장 데이터 원본을 바꾸지 않는다.
     *
     * 실무 설계 이유:
     * - 화면에 필요한 데이터만 정렬/계산하면 월 이동이 빨라지고, 렌더링 규칙도 명확해진다.
     */
    function getVisibleCalendarEventRanges(calendarCells, savedEvents) {
      const calendarStart = calendarCells[0].date;
      const calendarEnd = calendarCells[calendarCells.length - 1].date;
      return savedEvents
        .map((eventItem) => ({ eventItem, ...getEventRenderRange(eventItem) }))
        .filter((item) => item.startDate && item.endDate && item.endDate >= calendarStart && item.startDate <= calendarEnd)
        .sort(compareCalendarEventRanges);
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 멀티데이 행사 바가 날짜 셀 안에서 잘리지 않고 주(row) 단위로 이어지게 하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - grid-column, laneIndex 같은 값은 캘린더 화면 배치 전용 계산이다.
     *
     * 실무 설계 이유:
     * - 겹치는 행사를 lane으로 분리하면 행사 바가 서로 덮이지 않아 운영자가 월간 일정을 빠르게 읽을 수 있다.
     */
    function buildCalendarWeekSegments(weekCells, eventRanges) {
      const weekStart = weekCells[0].date;
      const weekEnd = weekCells[6].date;
      const weekRanges = eventRanges.filter((range) => range.endDate >= weekStart && range.startDate <= weekEnd);
      const laneEnds = [];

      return weekRanges.map((range) => {
        const segmentStart = range.startDate > weekStart ? range.startDate : weekStart;
        const segmentEnd = range.endDate < weekEnd ? range.endDate : weekEnd;
        let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd < segmentStart);
        if (laneIndex < 0) {
          laneIndex = laneEnds.length;
          laneEnds.push(segmentEnd);
        } else {
          laneEnds[laneIndex] = segmentEnd;
        }

        const columnStart = daysBetween(weekStart, segmentStart) + 1;
        const columnEnd = daysBetween(weekStart, segmentEnd) + 2;
        return {
          eventItem: range.eventItem,
          segmentStart,
          segmentEnd,
          columnStart,
          columnEnd,
          laneIndex,
          continuesLeft: segmentStart > range.startDate,
          continuesRight: segmentEnd < range.endDate,
          clickDateKey: formatDateKey(segmentStart),
        };
      });
    }

    function compareCalendarEventRanges(a, b) {
      return a.startDate - b.startDate
        || b.endDate - a.endDate
        || String(a.eventItem.eventName).localeCompare(String(b.eventItem.eventName), "ko-KR");
    }

    function isDateWithinRange(date, startDate, endDate) {
      return date >= startDate && date <= endDate;
    }

    function daysBetween(startDate, endDate) {
      const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      return Math.round((end - start) / 86400000);
    }

    return {
      renderCalendar,
    };
  }

  window.BANQUET_ERP_EVENT_CALENDAR = {
    createCalendarController,
  };
})();
