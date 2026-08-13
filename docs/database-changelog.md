# Database Changelog

## 2026-07-17

### 변경
- `venue_layout_images` 관리 화면의 수정/삭제 흐름을 DB와 Storage까지 연결했습니다.
- 수정 시 기존 등록 폼을 재사용해 `venue_layout_images`, `files`, `file_links`를 갱신하도록 했습니다.
- 삭제 시 `venue_layout_images` 레코드, 연결된 `files` 레코드, `venue-layouts` Storage 파일을 함께 정리하도록 했습니다.
- `venue-layouts` Storage 객체 삭제를 허용하는 별도 migration을 추가했습니다.

### 영향 파일
- `outputs/src/venueLayoutManager.js`
- `outputs/event-order-preview.html`
- `outputs/index.html`
- `outputs/src/styles/assets.css`
- `supabase/migrations/20260717100000_add_venue_layout_storage_delete_policy.sql`

## 2026-07-16

### 변경
- 공통 파일 메타데이터 테이블 `files`를 추가하는 migration을 준비했습니다.
- 파일과 업무 엔티티를 다형적으로 연결하는 `file_links` 테이블을 추가하는 migration을 준비했습니다.
- 연회장 기본 도면과 검증된 레이아웃 이미지를 관리하는 `venue_layout_images` 테이블을 추가하는 migration을 준비했습니다.
- Supabase Storage 버킷 `venue-layouts`를 추가하는 migration을 준비했습니다.
- 기존 `asset-images`, `ai-chat-attachments` 구조는 유지하고, 새 도면/레이아웃 이미지는 공통 파일 구조와 연결하는 방향으로 정리했습니다.
- AI 비서 일반 대화가 질문 의도에 따라 `venue_layout_images`와 `files`를 선택 조회해 도면/레이아웃 이미지를 답변 근거로 사용할 수 있게 연결했습니다.

### 영향 파일
- `supabase/migrations/20260715133000_add_common_files_and_venue_layout_images.sql`
- `supabase/functions/event-order-ai-chat/index.ts`
- `docs/database-schema.md`
- `docs/database-changelog.md`

### 주의
- DB 구조, 문서, 프론트엔드 등록/조회 UI, AI 자동 분석 추천 카드, AI 비서 일반 대화 조회 흐름까지 연결했습니다.
- Supabase DB에는 `supabase db push`, Edge Function에는 `supabase functions deploy event-order-ai-chat` 재배포가 필요합니다.
- 다음 단계에서는 실제 도면/레이아웃 이미지를 등록하고 질문/자동분석 테스트를 진행합니다.

## 2026-07-14

### 변경
- `ai_knowledge.status` 공식 값을 `draft`, `pending`, `approved`, `rejected`, `archived`로 통일하는 migration을 추가했습니다.
- 기존 `ai_knowledge.status='confirmed'` 데이터는 `approved`로 변환하도록 했습니다.
- `ai_knowledge.status` 기본값을 `draft`로 설정했습니다.
- 직접 가르치기/학습 인터뷰 승인 저장 시 Supabase insert 응답을 반환받아 실제 저장 성공 여부를 확인하도록 했습니다.

### 영향 파일
- `supabase/migrations/20260714162000_fix_ai_knowledge_status_check.sql`
- `outputs/src/aiAssistant.js`
## 2026-07-14

### 蹂寃?- `ai_interviews`??吏곸젒 媛瑜댁튂湲??먮Ц怨??숈뒿 怨쇱젙 湲곕줉?⑹쑝濡??좎??⑸땲??
- `ai_knowledge`???뱀씤??援ъ“??吏????μ냼濡??ъ슜?섎룄濡??뺣━?덉뒿?덈떎.
- `ai_knowledge`??遺議깊븷 ???덈뒗 `object`, `value`, `natural_language`, `status`, `source_interview_id`, `created_at`, `updated_at` 而щ읆??異붽??섎뒗 migration??以鍮꾪뻽?듬땲??
- 吏곸젒 媛瑜댁튂湲곗? AI ?숈뒿 ?명꽣酉곗쓽 吏??????곹깭瑜?`approved` 湲곗??쇰줈 ?듭씪?덉뒿?덈떎.
- ?쇰컲 AI ??붾뒗 `ai_knowledge.status='approved'`??吏?앸쭔 李몄“?섎룄濡?Edge Function 議고쉶 湲곗???蹂寃쏀뻽?듬땲??

### ?곹뼢 ?뚯씪
- `supabase/migrations/20260714151000_align_ai_knowledge_learning_fields.sql`
- `outputs/src/aiAssistant.js`
- `supabase/functions/event-order-ai-chat/index.ts`
??臾몄꽌??Venezia Banquet ERP??DB 蹂寃??대젰??湲곕줉?섎뒗 怨듭떇 蹂寃?濡쒓렇?낅땲??

?욎쑝濡?DB 援ъ“瑜?蹂寃쏀븷 ?뚮뒗 ?꾩껜 schema SQL???ㅼ떆 ?ㅽ뻾?섏? ?딄퀬, `supabase/migrations/` ?꾨옒???묒? migration SQL??異붽???????臾몄꽌? `docs/database-schema.md`瑜??④퍡 媛깆떊?⑸땲??

## 2026-07-11

### 蹂寃?
- 怨듭떇 DB ?ㅺ퀎 湲곗? 臾몄꽌 `docs/database-schema.md`瑜?異붽??덉뒿?덈떎.
- `venue_space_mappings`???ㅼ젣 怨듦컙 FK 而щ읆??`space_id` 湲곗??쇰줈 臾몄꽌?뷀뻽?듬땲??
- ???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?`venue_space_id`瑜?紐낆떆?덉뒿?덈떎.
- `venue_facilities`, `layout_rules`??怨듦컙 FK瑜?`space_id` 湲곗??쇰줈 ?뺣━?덉뒿?덈떎.
- ?꾩옱 ?꾨줈?앺듃??Supabase Auth瑜??ъ슜?섏? ?딆쑝誘濡?`auth.uid()` 諛?`created_by` ?꾪꽣瑜??ъ슜?섏? ?딅뒗 洹쒖튃??臾몄꽌?뷀뻽?듬땲??
- AI ?숈뒿 ?명꽣酉곗? ?됱궗 ?뚭퀬 湲곕뒫???꾩슂??migration ?뚯씪??以鍮꾪뻽?듬땲??
- `event_notes.note_type`??`post_event_review`瑜??덉슜?섎뒗 migration ?뚯씪??以鍮꾪뻽?듬땲??
- `ai_knowledge` 以묐났 ???諛⑹?瑜??꾪븳 unique index 湲곗????뺣━?덉뒿?덈떎.
- `event_orders` ???payload?먯꽌 ?ㅼ젣 DB???녿뒗 `venue_id`, `venue_space_ids`, `venue_space_names`瑜??쒓굅?덉뒿?덈떎.
- ?쇱젙蹂??μ냼??`event_schedules.venue`???먮낯 臾몄옄?대줈 ??ν븯怨? ?μ냼 DB 留ㅽ븨? 遺꾩꽍/?쒖떆 ?쒖젏??泥섎━?섎뒗 湲곗??쇰줈 ?뺣━?덉뒿?덈떎.
- ?대깽?몄삤??AI 吏??怨듬갚 遺꾩꽍??`event_orders.venue_id`???섏〈?섏? ?딄퀬 `event_schedules.venue` ?먮Ц??湲곗??쇰줈 誘몃ℓ???μ냼 吏덈Ц???앹꽦?섎룄濡??섏젙?덉뒿?덈떎.
- ?ν썑 ?쇱젙蹂??μ냼 留ㅽ븨 寃곌낵瑜???ν븷 ???덈룄濡?`event_schedules` 湲곗? migration ?쒖븞 ?뚯씪??異붽??덉뒿?덈떎.

### ?곹뼢 ?뚯씪

- `docs/database-schema.md`
- `docs/database-changelog.md`
- `outputs/supabase-event-orders-schema.sql`
- `outputs/supabase-venue-space-id-migration.sql`
- `supabase/migrations/20260711100000_add_ai_review_fields.sql`
- `supabase/migrations/20260711101000_align_venue_space_columns.sql`
- `supabase/migrations/20260711102000_add_event_schedule_venue_mapping.sql`
- `supabase/functions/event-order-ai-chat/index.ts`
- `outputs/event-order-preview.html`
- `outputs/index.html`
- `outputs/src/aiAssistant.js`

### 諛쒓껄??遺덉씪移?
- `venue_space_mappings` ?ㅼ젣 而щ읆? `space_id`?몃뜲, ?덉쟾 SQL/臾몄꽌?먯꽌 `venue_space_id`瑜??ъ슜???붿쟻???덉뿀?듬땲??
- ?꾩옱 ?꾨줈?앺듃??Supabase Auth瑜??ъ슜?섏? ?딅뒗?? ?덉쟾 ?ㅺ퀎?먮뒗 `created_by = auth.uid()` 諛⑹떇???욎뿬 ?덉뿀?듬땲??
- `event_notes.note_type`???됱궗 ?뚭퀬??`post_event_review`媛 ?꾩슂?섏?留?湲곗〈 check constraint?먮뒗 ?놁쓣 ???덉뒿?덈떎.
- `ai_interviews`??`source_type`, `source_id`, `priority`媛 ?꾩슂?섏?留?湲곗〈 DB?먮뒗 ?놁쓣 ???덉뒿?덈떎.
- `event_orders.meal_types`??肄붾뱶?먯꽌 ?ъ슜?섏?留??ㅼ젣 Supabase DB???놁쑝硫?????ㅻ쪟媛 諛쒖깮?????덉쑝誘濡??뺤씤???꾩슂?⑸땲??
- `event_orders.venue_id`???ㅼ젣 DB???녿뒗?????payload?먯꽌 ?꾩넚?섏뼱 schema cache ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.
- ???대깽?몄삤?붿뿉 ?쇱젙蹂??μ냼媛 ?щ윭 媛?議댁옱?섎?濡????`venue_id`瑜?`event_orders`????ν븯??諛⑹떇? ?꾩옱 援ъ“? 留욎? ?딆뒿?덈떎.
- ?꾩옱 `event_schedules`?먮뒗 ?쇱젙蹂??μ냼 ?곌껐 FK 而щ읆???녾퀬 `venue` ?먮Ц 臾몄옄?대쭔 ?덉쑝誘濡? 留ㅽ븨 寃곌낵 ??μ? 蹂꾨룄 migration ?곸슜 ??吏꾪뻾?댁빞 ?⑸땲??
- `ai_interviews`, `ai_knowledge`??RLS 諛?policy???ㅼ젣 Supabase ??쒕낫?쒖뿉???뺤씤???꾩슂?⑸땲??

### 二쇱쓽

- `docs/database-schema.md`???꾩옱 肄붾뱶, SQL, ?ъ슜???뺤씤 ?ы빆??湲곗??쇰줈 ?묒꽦?덉뒿?덈떎.
- ?ㅼ젣 Supabase DB ?꾩껜瑜?吏곸젒 introspection??寃곌낵???꾨땲誘濡?臾몄꽌??`?뺤씤 ?꾩슂` ??ぉ? Supabase Table Editor ?먮뒗 SQL Editor?먯꽌 理쒖쥌 ?뺤씤?댁빞 ?⑸땲??
- migration ?ㅽ뻾 ???댁쁺 ?곗씠??諛깆뾽??沅뚯옣?⑸땲??


