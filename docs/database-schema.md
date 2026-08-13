# Venezia Banquet ERP Database Schema

> 최신 기준: `ai_knowledge.status` 공식 값은 `draft`, `pending`, `approved`, `rejected`, `archived`입니다. 기존 `confirmed` 값은 migration에서 `approved`로 변환합니다. 일반 AI 대화는 `status='approved'` 지식만 조회합니다.

??臾몄꽌???꾩옱 ERP 肄붾뱶? SQL?먯꽌 ?ъ슜 以묒씤 Supabase DB 援ъ“??怨듭떇 湲곗? 臾몄꽌?낅땲??

湲곗? ?먮즺:

- `outputs/supabase-event-orders-schema.sql`
- `outputs/supabase-venue-space-id-migration.sql`
- `supabase/functions/event-order-ai-chat/index.ts`
- `outputs/event-order-preview.html`
- `outputs/src/*.js`
- ?ъ슜???뺤씤 ?ы빆: `venue_space_mappings`???ㅼ젣 而щ읆? `space_id`?대ŉ `venue_space_id`媛 ?꾨떂

二쇱쓽: ??臾몄꽌???꾩옱 ?꾨줈?앺듃 肄붾뱶? SQL, 洹몃━怨??ъ슜?먭? ?뺤씤???ㅼ젣 DB ?뺣낫瑜?湲곗??쇰줈 ?묒꽦?덉뒿?덈떎. Supabase ??쒕낫?쒖뿉??吏곸젒 introspection???꾩껜 ?ㅻ깄?룹? ?꾨땲誘濡? `?뺤씤 ?꾩슂`濡??쒖떆????ぉ? ?ㅼ젣 Supabase Table Editor ?먮뒗 SQL Editor?먯꽌 理쒖쥌 ?뺤씤?댁빞 ?⑸땲??

## DB 蹂寃?洹쒖튃

DB 援ъ“瑜?蹂寃쏀븷 ??諛섎뱶???④퍡 ?섏젙??寃?

1. Supabase migration SQL
2. `docs/database-schema.md`
3. 愿??`src` 肄붾뱶
4. 愿??Edge Function
5. 蹂寃?濡쒓렇

臾몄꽌? ?ㅼ젣 DB媛 ?ㅻ? 寃쎌슦 ?ㅼ젣 DB瑜??뺤씤????臾몄꽌瑜?利됱떆 媛깆떊?쒕떎.

?욎쑝濡쒕뒗 ?꾩껜 schema SQL??諛섎났 ?ㅽ뻾?섏? ?딄퀬, ?묒? migration SQL???꾩쟻?섎뒗 諛⑹떇??湲곕낯?쇰줈 ?쒕떎.

?섎せ??諛⑹떇:

```sql
-- ?꾩껜 500以꾩쭨由?schema SQL??留ㅻ쾲 ?ㅼ떆 ?ㅽ뻾
```

沅뚯옣 諛⑹떇:

```sql
-- ?꾩슂??蹂寃쎈쭔 ?ы븿??migration SQL ?ㅽ뻾
-- ?? supabase/migrations/20260711100000_add_ai_review_fields.sql
```

## 怨듯넻 ?댁쁺 ?먯튃

- ?꾩옱 ?꾨줈?앺듃??Supabase Authentication???ъ슜?섏? ?딅뒗??
- `auth.uid()` 湲곕컲 `created_by` ?꾪꽣???ъ슜?섏? ?딅뒗??
- ?⑥씪 愿由ъ옄 ERP 援ъ“?대ŉ, 濡쒓렇?몄? ?꾨줎???대? 怨꾩젙 諛⑹떇?대떎.
- RLS??prototype policy濡?`anon` ?꾩껜 ?묎렐???덉슜?섎뒗 援ъ“媛 留롫떎. ?댁쁺 ??蹂댁븞 ?뺤콉 ?ъ꽕怨꾧? ?꾩슂?섎떎.
- `venue_space_mappings`???ㅼ젣 怨듦컙 FK 而щ읆? 諛섎뱶??`space_id`瑜??ъ슜?쒕떎.
- `venue_space_id`?????댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐낆씠??

---

## venues

紐⑹쟻:
?댁쁺???ъ슜?섎뒗 ?됱궗?λ챸 ?먮뒗 議고빀 怨듦컙紐낆쓣 ??ν븳?? ?? 而⑤깽??A?, 遺?쇰끂 I+II.

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| venue_name | text | ?꾨땲??| ?놁쓬 | Unique | ?댁쁺 ?됱궗?λ챸 |
| venue_code | text | ??| ?놁쓬 | ?놁쓬 | 肄붾뱶媛?|
| floor | text | ??| ?놁쓬 | ?놁쓬 | 痢?|
| description | text | ??| ?놁쓬 | ?놁쓬 | ?ㅻ챸 |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?ъ슜 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- ?놁쓬

Unique Index:
- `venues_venue_name_key` on `venue_name`

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype venues access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ?μ냼紐?吏곸젒 留ㅼ묶
- `supabase/functions/event-order-ai-chat/index.ts`: AI 吏??怨듬갚 遺꾩꽍 李몄“ ?곗씠??- `outputs/supabase-event-orders-schema.sql`: seed ?곗씠??諛?unique index

二쇱쓽?ы빆:
- `venue_aliases`? ?④퍡 ?ъ슜?쒕떎.
- ?댁쁺紐낆묶?대ŉ ?ㅼ젣 臾쇰━ 怨듦컙? `venue_spaces`? 遺꾨━?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## venue_spaces

紐⑹쟻:
?ㅼ젣 臾쇰━ 怨듦컙 ?⑥쐞瑜???ν븳?? ?? 而⑤깽??, 而⑤깽??, 而⑤깽??.

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| space_name | text | ?꾨땲??| ?놁쓬 | Unique | ?ㅼ젣 怨듦컙紐?|
| space_code | text | ??| ?놁쓬 | ?놁쓬 | 怨듦컙 肄붾뱶 |
| floor | text | ??| ?놁쓬 | ?놁쓬 | 痢?|
| description | text | ??| ?놁쓬 | ?놁쓬 | ?ㅻ챸 |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?ъ슜 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- ?놁쓬

Unique Index:
- `venue_spaces_space_name_key` on `space_name`

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype venue_spaces access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/src/aiAssistant.js`: AI 李몄“ ?곗씠???듦퀎
- `supabase/functions/event-order-ai-chat/index.ts`: AI 吏??怨듬갚 遺꾩꽍 李몄“ ?곗씠??- `outputs/event-order-preview.html`: venue 留ㅽ븨 寃곌낵 ?쒖떆

二쇱쓽?ы빆:
- 而⑤깽??A?? ?댁쁺紐낆묶?대ŉ ?ㅼ젣 怨듦컙?⑥쐞??而⑤깽?? + 而⑤깽??濡?留ㅽ븨?쒕떎.
- 而⑤깽??B?? 而⑤깽???쇰줈 留ㅽ븨?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## venue_space_mappings

紐⑹쟻:
?됱궗?κ낵 ?ㅼ젣 怨듦컙 ?⑥쐞瑜??곌껐?섎뒗 留ㅽ븨 ?뚯씠釉?

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| venue_id | uuid | ?꾨땲??| ?놁쓬 | venues.id FK | ?곸쐞 ?됱궗??|
| space_id | uuid | ?꾨땲??| ?놁쓬 | venue_spaces.id FK | ?ㅼ젣 怨듦컙 |
| sort_order | integer | ??| 0 | ?놁쓬 | ?쒖떆 ?쒖꽌 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |

以묒슂:
?꾩옱 ?ㅼ젣 而щ읆紐낆? `space_id`?대ŉ `venue_space_id`媛 ?꾨땲??

Primary Key:
- `id`

Foreign Key:
- `venue_id` ??`venues.id`
- `space_id` ??`venue_spaces.id`

Unique Index:
- `venue_space_mappings_venue_id_space_id_key` ?먮뒗 ?숇벑??unique ?쒖빟: `(venue_id, space_id)`

?쇰컲 Index:
- `venue_space_mappings_venue_id_idx`
- `venue_space_mappings_space_id_idx`

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype venue_space_mappings access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: `venue_space_mappings?select=venue_id,sort_order,venue_spaces(...)`
- `supabase/functions/event-order-ai-chat/index.ts`: `select=venue_id,space_id,sort_order`
- `outputs/supabase-event-orders-schema.sql`: seed insert
- `outputs/supabase-venue-space-id-migration.sql`: ?덇굅??而щ읆 rename ???
二쇱쓽?ы빆:
- `venue_space_id`瑜??ъ슜?섎㈃ ?꾩옱 DB?먯꽌 ?ㅻ쪟媛 ?쒕떎.
- PostgREST 愿怨?議고쉶??FK ?대쫫???섏〈?????덉쑝誘濡? 愿怨??ㅻ쪟媛 ?섎㈃ Supabase?먯꽌 FK ?대쫫???뺤씤?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `venue_space_id`

---

## venue_aliases

紐⑹쟻:
?대깽?몄삤?붿뿉??異붿텧???μ냼紐?蹂꾩묶??怨듭떇 `venues`??留ㅽ븨?쒕떎.

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| venue_id | uuid | ?꾨땲??| ?놁쓬 | venues.id FK | 留ㅽ븨 ????됱궗??|
| alias_name | text | ?꾨땲??| ?놁쓬 | Unique lower(alias_name) | 蹂꾩묶 |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?ъ슜 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `venue_id` ??`venues.id`

Unique Index:
- `venue_aliases_alias_name_lower_key` on `lower(alias_name)`

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype venue_aliases access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ?μ냼 alias ?곗꽑 留ㅼ묶
- `supabase/functions/event-order-ai-chat/index.ts`: AI 吏??怨듬갚 遺꾩꽍 李몄“ ?곗씠??
二쇱쓽?ы빆:
- ?μ냼 ?몄떇 ?쒖꽌: `venue_aliases.alias_name` ?곗꽑, ?놁쑝硫?`venues.venue_name` 吏곸젒 留ㅼ묶.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## venue_facilities

紐⑹쟻:
?ㅼ젣 怨듦컙 ?⑥쐞蹂??쒖꽕臾??먮뒗 怨좎젙 ?ㅻ퉬瑜???ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| space_id | uuid | ?꾨땲??| ?놁쓬 | venue_spaces.id FK | ?ㅼ젣 怨듦컙 |
| facility_name | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | ?쒖꽕臾쇰챸 |
| facility_type | text | ??| ?놁쓬 | ?놁쓬 | ?쒖꽕臾??좏삎 |
| quantity | integer | ??| ?놁쓬 | ?놁쓬 | ?섎웾 |
| spec | text | ??| ?놁쓬 | ?놁쓬 | 洹쒓꺽 |
| location_note | text | ??| ?놁쓬 | ?놁쓬 | ?꾩튂 硫붾え |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?ъ슜 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `space_id` ??`venue_spaces.id`

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype venue_facilities access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `supabase/functions/event-order-ai-chat/index.ts`: `select=space_id,facility_name,quantity,spec`

二쇱쓽?ы빆:
- `venue_space_id`媛 ?꾨땲??`space_id` 湲곗??쇰줈 ?듭씪?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `venue_space_id`

---

## layout_rules

紐⑹쟻:
?됱궗???먮뒗 ?ㅼ젣 怨듦컙蹂??덉씠?꾩썐 ?섏슜 洹쒖튃????ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| venue_id | uuid | ??| ?놁쓬 | venues.id FK | ?됱궗??湲곗? 洹쒖튃 |
| space_id | uuid | ??| ?놁쓬 | venue_spaces.id FK | ?ㅼ젣 怨듦컙 湲곗? 洹쒖튃 |
| layout_type | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | ?덉씠?꾩썐 ?좏삎 |
| min_people | integer | ??| ?놁쓬 | ?놁쓬 | 理쒖냼 ?몄썝 |
| max_people | integer | ??| ?놁쓬 | ?놁쓬 | 理쒕? ?몄썝 |
| rule_note | text | ??| ?놁쓬 | ?놁쓬 | 洹쒖튃 ?ㅻ챸 |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?ъ슜 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `venue_id` ??`venues.id`
- `space_id` ??`venue_spaces.id`

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype layout_rules access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- ?꾩옱 二쇱슂 ?꾨줎??Edge Function 吏곸젒 議고쉶 ?꾩튂???뺤씤?섏? ?딆쓬
- ?ν썑 AI ?덉씠?꾩썐 異붿쿇?먯꽌 ?ъ슜 ?덉젙

二쇱쓽?ы빆:
- `venue_id` ?먮뒗 `space_id` 以??섎굹???덉뼱???쒕떎.
- `venue_space_id`媛 ?꾨땲??`space_id` 湲곗??쇰줈 ?듭씪?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `venue_space_id`

---

## event_orders

紐⑹쟻:
?대깽?몄삤?붿쓽 湲곕낯 ?됱궗 ?뺣낫瑜???ν븯??硫붿씤 ?뚯씠釉?

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | ?됱궗 ID |
| event_name | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | ?됱궗紐?|
| company_name | text | ??| ?놁쓬 | ?놁쓬 | ?됱궗二쇱턀/二쇨? |
| event_datetime | text | ??| ?놁쓬 | ?놁쓬 | ?먮낯 ?됱궗?쇱떆 ?띿뒪??|
| start_date | date | ??| ?놁쓬 | ?놁쓬 | 罹섎┛???뚮뜑留??쒖옉??|
| end_date | date | ??| ?놁쓬 | ?놁쓬 | 罹섎┛???뚮뜑留?醫낅즺??|
| venue | text | ??| ?놁쓬 | ?놁쓬 | ?쒖떆???μ냼紐?|
| guest_count | integer | ??| ?놁쓬 | ?놁쓬 | ????됱궗 ?몄썝 |
| event_type | text | ??| ?놁쓬 | ?놁쓬 | ?ъ슜???낅젰 ?됱궗?좏삎 |
| meal_types | text[] | ?꾨땲??| '{}' | ?놁쓬 | ?앹궗?좏삎 ??諛곗뿴 |
| color | text | ?꾨땲??| green | ?놁쓬 | 罹섎┛???됱긽 ??|
| original_filename | text | ??| ?놁쓬 | ?놁쓬 | ?먮낯 ?뚯씪紐?|
| storage_path | text | ??| ?놁쓬 | Storage path | ?먮낯 ?묒? Storage 寃쎈줈 |
| internal_memo | text | ??| ?놁쓬 | ?놁쓬 | ?대? 硫붾え 理쒖떊/?붿빟 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- ?놁쓬. ?꾩옱 湲곗??쇰줈 `event_orders`?먮뒗 ???`venue_id`瑜???ν븯吏 ?딅뒗??

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype event_orders access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: insert/update/delete/select
- `supabase/functions/event-order-ai-chat/index.ts`: ?쇰컲 AI ??? ?대깽?몄삤??AI 寃?? ?뚭퀬 吏덈Ц ?앹꽦
- `outputs/src/aiAssistant.js`: AI 李몄“ ?듦퀎

二쇱쓽?ы빆:
- ???대깽?몄삤???덉뿉??議곗떇/?몃???泥댄겕?몄쿂???쇱젙蹂??μ냼媛 ?щ윭 媛?議댁옱?????덉쑝誘濡?`event_orders`?????`venue_id`瑜??꾩쓽 ??ν븯吏 ?딅뒗??
- ?됱궗 湲곕낯?뺣낫?먮뒗 ?먮낯/?쒖떆???μ냼 臾몄옄?댁씤 `venue`留?蹂댁〈?쒕떎.
- ?쇱젙蹂??먮낯 ?μ냼??`event_schedules.venue`????ν븳??
- `venues`, `venue_aliases`, `venue_space_mappings`, `venue_spaces` 湲곕컲 留ㅽ븨? 遺꾩꽍/?쒖떆 ?쒖젏???ъ슜?쒕떎.
- `meal_types` 而щ읆???ㅼ젣 DB???놁쑝硫?????ㅻ쪟媛 ?????덉뼱, 諛고룷 ???ㅼ젣 Supabase 援ъ“ ?뺤씤 ?꾩슂.
- `start_date`, `end_date`??硫?곕뜲??罹섎┛??諛붿쓽 湲곗??대떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `event_date`???꾩옱 肄붾뱶 湲곗? 硫붿씤 ???而щ읆?쇰줈 ?ъ슜?섏? ?딆쓬
- `event_orders.venue_id`
- `event_orders.venue_space_ids`
- `event_orders.venue_space_names`

---

## event_calendar_dates

紐⑹쟻:
?섎굹???됱궗? 罹섎┛???쒖떆 ?좎쭨瑜??곌껐?쒕떎.

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| event_order_id | uuid | ?꾨땲??| ?놁쓬 | event_orders.id FK | ?됱궗 ID |
| calendar_date | date | ?꾨땲??| ?놁쓬 | ?놁쓬 | 罹섎┛???좎쭨 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `event_order_id` ??`event_orders.id`

Unique Index:
- `(event_order_id, calendar_date)`

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype event_calendar_dates access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ????섏젙/??젣/議고쉶
- `supabase/functions/event-order-ai-chat/index.ts`: AI ???諛??대깽?몄삤??寃??
二쇱쓽?ы빆:
- ?????Schedule???ㅼ젣 ?좎쭨瑜??곗꽑 ?ъ슜?쒕떎.
- ?좎쭨媛 ?녿뒗 寃쎌슦 ?됱궗湲곌컙?먯꽌 蹂댁젙?섎릺, ???꾩껜 ?좎쭨瑜??먮룞 ?앹꽦?섏? ?딅뒗??

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## event_schedules

紐⑹쟻:
?됱궗蹂?Schedule ?됱쓣 ??ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| event_order_id | uuid | ?꾨땲??| ?놁쓬 | event_orders.id FK | ?됱궗 ID |
| schedule_date | text | ??| ?놁쓬 | ?놁쓬 | ?ㅼ?以??좎쭨 ?띿뒪??|
| schedule_time | text | ??| ?놁쓬 | ?놁쓬 | ?쒓컙 |
| content | text | ??| ?놁쓬 | ?놁쓬 | ?쇱젙 ?댁슜 |
| venue | text | ??| ?놁쓬 | ?놁쓬 | ?쇱젙 ?μ냼 ?먮Ц |
| people | integer | ??| ?놁쓬 | ?놁쓬 | ?쇱젙蹂??몄썝 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `event_order_id` ??`event_orders.id`

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype event_schedules access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ????섏젙/議고쉶
- `supabase/functions/event-order-ai-chat/index.ts`: AI 遺꾩꽍/???
二쇱쓽?ы빆:
- ?꾩옱 ?ㅼ젣 援ъ“ 湲곗??쇰줈 ?쇱젙蹂??μ냼 ?먮Ц? `venue`????ν븳??
- `event_orders`?먮뒗 ???`venue_id`瑜???ν븯吏 ?딅뒗??
- ?쇱젙蹂??μ냼 留ㅽ븨 寃곌낵 ??μ씠 ?꾩슂?섎㈃ `supabase/migrations/20260711102000_add_event_schedule_venue_mapping.sql` ?곸슜 ??`event_schedules.venue_id`, `event_schedules.venue_space_ids`, `event_schedules.venue_space_names`瑜??ъ슜?쒕떎.
- Schedule 異붿텧? ?좎쭨 A?? ?쒓컙 B/C?? ?댁슜 D ?먮뒗 C?? ?μ냼 E?? ?몄썝 G?????묒떇蹂??덉쇅媛 議댁옱?쒕떎.
- ?쇰젋泥??쇱젙? AI ?댁쁺 遺꾩꽍?먯꽌 ?쒖쇅?섎뒗 洹쒖튃???덈떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `scheduleDate`, `time` ?깆? ?꾨줎???대? 媛앹껜紐낆씠硫?DB 而щ읆紐낆씠 ?꾨떂

---

## event_items

紐⑹쟻:
?대깽?몄삤??Items/F&B 湲덉븸 ??ぉ????ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| event_order_id | uuid | ?꾨땲??| ?놁쓬 | event_orders.id FK | ?됱궗 ID |
| item_name | text | ??| ?놁쓬 | ?놁쓬 | ??ぉ紐?|
| unit_price | numeric | ??| ?놁쓬 | ?놁쓬 | ?④? |
| quantity | numeric | ??| ?놁쓬 | ?놁쓬 | ?섎웾 |
| amount | numeric | ??| ?놁쓬 | ?놁쓬 | 湲덉븸 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- `event_order_id` ??`event_orders.id`

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype event_items access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ????섏젙/議고쉶
- `supabase/functions/event-order-ai-chat/index.ts`: AI 遺꾩꽍/???
二쇱쓽?ы빆:
- ?묒떇/?⑥뒪??肄붿뒪 媛먯?? ?꾩슂湲곕Ъ 怨꾩궛???ъ슜?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- `itemName`, `unitPrice`???꾨줎???대? 媛앹껜紐낆씠硫?DB 而щ읆紐낆씠 ?꾨떂

---

## event_notes

紐⑹쟻:
Layout & EQP, Others, ?대?硫붾え, ?됱궗 ?뚭퀬瑜???ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 怨좎쑀 ID |
| event_order_id | uuid | ?꾨땲??| ?놁쓬 | event_orders.id FK | ?됱궗 ID |
| note_type | text | ?꾨땲??| ?놁쓬 | check | 硫붾え ?좏삎 |
| content | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | ?먮Ц ?댁슜 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖. migration ?꾩슂 媛??|

?덉슜 note_type:
- `layout_eqp`
- `others`
- `internal_memo`
- `post_event_review`

Primary Key:
- `id`

Foreign Key:
- `event_order_id` ??`event_orders.id`

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype event_notes access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/event-order-preview.html`: ?대?硫붾え ??? ?곸꽭 紐⑤떖 ?쒖떆
- `outputs/src/aiAssistant.js`: ?됱궗 ?뚭퀬 ?듬? ???- `supabase/functions/event-order-ai-chat/index.ts`: AI 遺꾩꽍/???
二쇱쓽?ы빆:
- 湲곗〈 SQL??create table 援щЦ? `post_event_review`瑜??ы븿?섏? ?딆븯怨? ?섎떒 alter constraint?먯꽌 蹂댁젙?쒕떎.
- ?ㅼ젣 DB??`updated_at`???녿뒗 寃쎌슦 migration ?꾩슂.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## banquet_assets

紐⑹쟻:
?고쉶???먯궛怨??섎웾, ?꾩튂, ?대?吏 URL????ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | ?먯궛 ID |
| asset_name | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | ?먯궛紐?|
| floor | text | ??| ?놁쓬 | ?놁쓬 | 痢?|
| location | text | ??| ?놁쓬 | ?놁쓬 | ?꾩튂 |
| quantity | integer | ??| ?놁쓬 | ?놁쓬 | ?섎웾 |
| spec | text | ??| ?놁쓬 | ?놁쓬 | 洹쒓꺽 |
| image_url | text | ??| ?놁쓬 | Storage public URL | ?대?吏 URL |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- ?놁쓬

Unique Index:
- ?뺤씤 ?꾩슂

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype banquet_assets access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/src/assetManager.js`: 議고쉶/?깅줉/?섏젙/??젣
- `outputs/src/aiAssistant.js`: AI 李몄“ ?듦퀎
- `supabase/functions/event-order-ai-chat/index.ts`: AI ?먯궛 吏덉쓽 ?듬?, AI 遺꾩꽍 李몄“

二쇱쓽?ы빆:
- ?대?吏??Storage `asset-images` 踰꾪궥???ъ슜?쒕떎.
- 愿由ъ옄留?異붽?/?섏젙/??젣 媛?ν븯?꾨줉 ?꾨줎?몄뿉???쒖뼱?쒕떎. DB ?뺤콉? ?꾩옱 prototype ?섏??대떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## banquet_recommend_items

紐⑹쟻:
AI ?먮룞 遺꾩꽍???꾩슂湲곕Ъ 異붿쿇 留덉뒪?곕? ??ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 異붿쿇 ??ぉ ID |
| name | text | ?꾨땲??| ?놁쓬 | Unique | 異붿쿇 ??ぉ紐?|
| category | text | ??| ?놁쓬 | ?놁쓬 | 移댄뀒怨좊━ |
| keywords | jsonb | ?꾨땲??| [] | ?놁쓬 | 媛먯? ?ㅼ썙??|
| trigger_section | jsonb | ?꾨땲??| [] | ?놁쓬 | 媛먯? ????뱀뀡 |
| calc_type | text | ?꾨땲??| manual | check | 怨꾩궛 諛⑹떇 |
| default_qty | numeric | ??| ?놁쓬 | ?놁쓬 | 湲곕낯 ?섎웾 |
| multiplier | numeric | ?꾨땲??| 1 | ?놁쓬 | 諛곗닔 |
| components | jsonb | ?꾨땲??| {} | ?놁쓬 | 援ъ꽦??留?|
| exclude_venues | jsonb | ?꾨땲??| [] | ?놁쓬 | ?쒖쇅 ?μ냼 |
| recommended_items | jsonb | ?꾨땲??| [] | ?놁쓬 | 異붿쿇 ?몃? ??ぉ |
| is_active | boolean | ?꾨땲??| true | ?놁쓬 | ?쒖꽦 ?щ? |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?섏젙 ?쒓컖 |

Primary Key:
- `id`

Foreign Key:
- ?놁쓬

Unique Index:
- `banquet_recommend_items_name_key` on `name`

?쇰컲 Index:
- `banquet_recommend_items_active_idx` on `is_active`

RLS:
- ?쒖꽦?붾맖

二쇱슂 Policy:
- `prototype banquet_recommend_items access`: `anon` ?꾩껜 ?묎렐 ?덉슜

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `supabase/functions/event-order-ai-chat/index.ts`: `is_active=true` 異붿쿇 洹쒖튃 議고쉶

二쇱쓽?ы빆:
- AI?????뚯씠釉붿쓽 active ??ぉ 以?議곌굔??留욌뒗 寃껊쭔 異붿쿇?댁빞 ?쒕떎.
- `components`媛 ?덉쑝硫??명듃紐낅쭔 ?쒖떆?섏? ?딄퀬 援ъ꽦?덈퀎 ?섎웾?쇰줈 ?쇱퀜 ?쒖떆?쒕떎.

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?
- ?놁쓬

---

## ai_interviews

紐⑹쟻:
AI ?숈뒿 ?명꽣酉?吏덈Ц, ?대깽?몄삤???뺤씤 吏덈Ц, ?됱궗 ?뚭퀬 吏덈Ц????ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | ?명꽣酉?ID |
| category | text | ??| ?놁쓬 | ?놁쓬 | 吏덈Ц 遺꾨쪟 |
| question | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | 吏덈Ц |
| question_reason | text | ??| ?놁쓬 | ?놁쓬 | 吏덈Ц ?댁쑀 |
| answer | text | ??| ?놁쓬 | ?놁쓬 | ?ъ슜???듬? |
| status | text | ?꾨땲??| pending | ?놁쓬 | pending/answered/confirmed ??|
| entity_type | text | ??| ?놁쓬 | ?놁쓬 | ?곌껐 ?뷀떚???좏삎 |
| entity_id | uuid | ??| ?놁쓬 | event_orders.id ??| ?곌껐 ?뷀떚??ID |
| source_type | text | ??| ?놁쓬 | ?놁쓬 | 吏덈Ц 異쒖쿂 ?좏삎 |
| source_id | uuid | ??| ?놁쓬 | event_orders.id ??| 吏덈Ц 異쒖쿂 ID |
| priority | text | ??| ?놁쓬 | ?놁쓬 | high/medium/low |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| answered_at | timestamptz | ??| ?놁쓬 | ?놁쓬 | ?듬? ?쒓컖 |
| updated_at | timestamptz | ??| ?놁쓬 | ?놁쓬 | ?섏젙 ?쒓컖 |

?뺤씤 ?꾩슂:
- ?ㅼ젣 DB??`created_by` 而щ읆???⑥븘 ?덉쓣 ???덉쑝???꾩옱 ?꾨줈?앺듃??Supabase Auth瑜??ъ슜?섏? ?딆쑝誘濡?肄붾뱶?먯꽌 ?붽뎄?섏? ?딅뒗??

Primary Key:
- `id`

Foreign Key:
- `entity_id`, `source_id`???쇰━?곸쑝濡?`event_orders.id` ?깃낵 ?곌껐?섏?留?DB FK ?쒖빟 ?щ? ?뺤씤 ?꾩슂

Unique Index:
- `ai_interviews_post_event_review_once_idx`: `category='post_event_review' and source_type='event_order'` 湲곗? `(source_type, source_id)`
- `ai_interviews_event_source_question_key`: `(source_type, source_id, normalized question)` 以묐났 諛⑹?

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?뺤씤 ?꾩슂. ?꾩옱 schema SQL?먮뒗 ai_interviews RLS/policy ?뺤쓽媛 紐낆떆?곸쑝濡??ы븿?섏뼱 ?덉? ?딆쓬.

二쇱슂 Policy:
- ?뺤씤 ?꾩슂

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/src/aiAssistant.js`: pending 吏덈Ц 議고쉶, ?듬? ??? ?뺤씤 移대뱶, 吏덈Ц ?꾨낫 ?깅줉, ?뚭퀬 ???- `outputs/event-order-preview.html`: pending 吏덈Ц 諛곗?
- `supabase/functions/event-order-ai-chat/index.ts`: 吏덈Ц ?꾨낫 ?앹꽦, ?대깽?몄삤??吏??怨듬갚 吏덈Ц ?앹꽦, ?됱궗 ?뚭퀬 吏덈Ц ?앹꽦

二쇱쓽?ы빆:
- 議고쉶 議곌굔? `status='pending'` 以묒떖?대떎.
- `created_by = auth.uid()` 議곌굔? ?ъ슜?섏? ?딅뒗??
- ?됱궗 ?뚭퀬 吏덈Ц? `category='post_event_review'`濡???ν븳??

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?諛⑹떇:
- `created_by = auth.uid()` ?꾪꽣留?
---

## ai_knowledge

紐⑹쟻:
AI ?숈뒿 ?명꽣酉곗뿉???ъ슜?먭? ?뺤씤??怨듭떇 ?댁쁺 吏?앹쓣 ??ν븳??

| 而щ읆紐?| ???| NULL ?덉슜 | 湲곕낯媛?| 愿怨?| ?ㅻ챸 |
|---|---|---:|---|---|---|
| id | uuid | ?꾨땲??| gen_random_uuid() | PK | 吏??ID |
| category | text | ??| ?놁쓬 | ?놁쓬 | 吏??遺꾨쪟 |
| subject | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | 二쇱뼱 |
| predicate | text | ?꾨땲??| ?놁쓬 | ?놁쓬 | 愿怨??띿꽦 |
| object_value | text | ??| ?놁쓬 | ?놁쓬 | 媛?|
| explanation | text | ??| ?놁쓬 | ?놁쓬 | ?ㅻ챸 |
| reason | text | ??| ?놁쓬 | ?놁쓬 | ?댁쑀 |
| source_interview_id | uuid | ??| ?놁쓬 | ai_interviews.id | 異쒖쿂 ?명꽣酉?|
| entity_type | text | ??| ?놁쓬 | ?놁쓬 | ?곌껐 ?뷀떚???좏삎 |
| entity_id | uuid | ??| ?놁쓬 | ?놁쓬 | ?곌껐 ?뷀떚??ID |
| confidence | numeric | ??| ?놁쓬 | ?놁쓬 | ?좊ː??|
| status | text | ?꾨땲??| confirmed | ?놁쓬 | 吏???곹깭 |
| original_answer | text | ??| ?놁쓬 | ?놁쓬 | ?ъ슜???먮떟蹂 |
| created_by | text/uuid | ??| ?놁쓬 | ?뺤씤 ?꾩슂 | ?꾩옱 誘몄궗??|
| confirmed_by | text/uuid | ??| ?놁쓬 | ?뺤씤 ?꾩슂 | ?꾩옱 誘몄궗??媛??|
| confirmed_at | timestamptz | ??| ?놁쓬 | ?놁쓬 | ?뺤씤 ?쒓컖 |
| created_at | timestamptz | ?꾨땲??| now() | ?놁쓬 | ?앹꽦 ?쒓컖 |
| updated_at | timestamptz | ??| ?놁쓬 | ?놁쓬 | ?섏젙 ?쒓컖 |

?뺤씤 ?꾩슂:
- `created_by`, `confirmed_by` ??낆? ?ㅼ젣 Supabase 援ъ“ ?뺤씤 ?꾩슂.
- ?꾩옱 肄붾뱶??Supabase Auth瑜??ъ슜?섏? ?딆쑝誘濡?`created_by`瑜??붽뎄?섏? ?딅뒗??

Primary Key:
- `id`

Foreign Key:
- `source_interview_id` ??`ai_interviews.id` 媛?μ꽦 ?덉쓬. ?ㅼ젣 ?쒖빟 ?뺤씤 ?꾩슂.

Unique Index:
- `ai_knowledge_unique_interview_fact_idx` on `(source_interview_id, subject, predicate, coalesce(object_value,''))`

?쇰컲 Index:
- ?뺤씤 ?꾩슂

RLS:
- ?뺤씤 ?꾩슂. ?꾩옱 schema SQL?먮뒗 ai_knowledge RLS/policy ?뺤쓽媛 紐낆떆?곸쑝濡??ы븿?섏뼱 ?덉? ?딆쓬.

二쇱슂 Policy:
- ?뺤씤 ?꾩슂

肄붾뱶?먯꽌 ?ъ슜?섎뒗 ?꾩튂:
- `outputs/src/aiAssistant.js`: 怨듭떇 吏????? 以묐났 議고쉶, 吏???듦퀎
- `supabase/functions/event-order-ai-chat/index.ts`: confirmed 吏??議고쉶, ?ㅼ쓬 吏덈Ц ?꾨낫 ?앹꽦, ?대깽?몄삤??吏??怨듬갚 遺꾩꽍

二쇱쓽?ы빆:
- ?쒕쭪?듬땲?ㅲ?踰꾪듉???꾨Ⅸ 寃쎌슦?먮쭔 ??ν븳??
- ?됱궗 ?뚭퀬 ?듬?? ?먮룞?쇰줈 ai_knowledge????ν븯吏 ?딅뒗??

???댁긽 ?ъ슜?섏? ?딅뒗 ?덉쟾 而щ읆紐?諛⑹떇:
- `auth.uid()` 湲곕컲 ?먮룞 ?ъ슜??湲곕줉

---

## ?꾩옱 諛쒓껄??DB/肄붾뱶 遺덉씪移?
| ??ぉ | ?꾩옱 ?ㅼ젣/湲곗? 援ъ“ | ?섎せ??二쇱쓽??援ъ“ | ?곹깭 |
|---|---|---|---|
| venue_space_mappings 怨듦컙 FK | `space_id` | `venue_space_id` | ?섏젙?? migration 異붽? |
| venue_facilities 怨듦컙 FK | `space_id` 湲곗??쇰줈 ?듭씪 | `venue_space_id` | SQL/Edge Function ?섏젙?? ?ㅼ젣 DB ?뺤씤 ?꾩슂 |
| layout_rules 怨듦컙 FK | `space_id` 湲곗??쇰줈 ?듭씪 | `venue_space_id` | SQL ?섏젙?? ?ㅼ젣 DB ?뺤씤 ?꾩슂 |
| ai_interviews created_by | ?꾩옱 ?꾨줈?앺듃 誘몄궗??| `created_by = auth.uid()` ?꾪꽣 | ?쒓굅???ъ슜 湲덉? |
| event_notes note_type | `layout_eqp`, `others`, `internal_memo`, `post_event_review` | 湲곗〈 create table check?먮뒗 `post_event_review` ?꾨씫 | migration ?꾩슂 |
| ai_interviews source fields | `source_type`, `source_id`, `priority` ?꾩슂 | 湲곗〈 ?뚯씠釉붿뿉 ?놁쓣 ???덉쓬 | migration ?꾩슂 |
| event_orders meal_types | 肄붾뱶媛 ???議고쉶 | ?ㅼ젣 DB???놁쓣 寃쎌슦 ????ㅻ쪟 | ?ㅼ젣 Supabase 援ъ“ ?뺤씤 ?꾩슂 |
| event_orders ?μ냼 FK | ???FK ??ν븯吏 ?딆쓬. `venue` 臾몄옄?대쭔 蹂댁〈 | `venue_id`, `venue_space_ids`, `venue_space_names` payload | ?쒓굅??|
| RLS/Policy | ?쇰? ?뚯씠釉붾쭔 schema??紐낆떆 | ai_interviews/ai_knowledge ?뺤콉 誘명솗??| ?ㅼ젣 Supabase 援ъ“ ?뺤씤 ?꾩슂 |

## 肄붾뱶 湲곗? ?뚯씠釉??ъ슜 ?꾩튂 ?붿빟

| ?뚯씠釉?| 二쇱슂 ?ъ슜 ?뚯씪 |
|---|---|
| venues | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| venue_spaces | `outputs/event-order-preview.html`, `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |
| venue_space_mappings | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| venue_aliases | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| venue_facilities | `supabase/functions/event-order-ai-chat/index.ts` |
| event_orders | `outputs/event-order-preview.html`, `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |
| event_calendar_dates | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| event_schedules | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| event_items | `outputs/event-order-preview.html`, `supabase/functions/event-order-ai-chat/index.ts` |
| event_notes | `outputs/event-order-preview.html`, `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |
| banquet_assets | `outputs/src/assetManager.js`, `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |
| banquet_recommend_items | `supabase/functions/event-order-ai-chat/index.ts` |
| ai_interviews | `outputs/event-order-preview.html`, `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |
| ai_knowledge | `outputs/src/aiAssistant.js`, `supabase/functions/event-order-ai-chat/index.ts` |

---

## files

목적:
Supabase Storage에 업로드된 이미지, PDF, 문서, 텍스트, 일반 파일의 공통 메타데이터를 저장합니다. 기존 `asset-images`, `ai-chat-attachments` 버킷은 유지하되, 신규 파일부터 이 테이블에 공통 기록을 남길 수 있도록 설계합니다.

| 컬럼명 | 타입 | NULL 허용 | 기본값 | 관계 | 설명 |
|---|---|---:|---|---|---|
| id | uuid | 아니오 | gen_random_uuid() | PK | 파일 고유 ID |
| bucket | text | 아니오 | 없음 | Storage bucket | Supabase Storage 버킷명 |
| storage_path | text | 아니오 | 없음 | 없음 | Storage object path |
| public_url | text | 예 | 없음 | 없음 | 공개 URL 또는 접근 URL |
| original_filename | text | 아니오 | 없음 | 없음 | 원본 파일명 |
| file_type | text | 아니오 | file | CHECK | image, pdf, document, text, file |
| mime_type | text | 예 | 없음 | 없음 | MIME type |
| file_size | bigint | 예 | 없음 | 없음 | 파일 크기 byte |
| width | integer | 예 | 없음 | 없음 | 이미지 너비 |
| height | integer | 예 | 없음 | 없음 | 이미지 높이 |
| description | text | 예 | 없음 | 없음 | 파일 설명 |
| uploaded_by | text | 예 | 없음 | 없음 | 업로드 사용자 식별값 |
| created_at | timestamptz | 아니오 | now() | 없음 | 생성 시각 |
| updated_at | timestamptz | 아니오 | now() | 없음 | 수정 시각 |

Primary Key:
- `id`

Foreign Key:
- 없음

Unique Index:
- `files_bucket_storage_path_key` on `(bucket, storage_path)`

일반 Index:
- `files_bucket_storage_path_idx`
- `files_file_type_idx`

RLS:
- 활성화

주요 Policy:
- `prototype files access`: `anon` 전체 접근 허용

코드에서 사용되는 위치:
- 현재 migration 기준 신규 구조입니다. 기존 자산/AI 첨부 로직은 아직 직접 사용하지 않습니다.

주의사항:
- 기존 Storage bucket을 물리적으로 통합하지 않습니다.
- 기존 `banquet_assets.image_url`, `ai_messages.attachments`, `ai_chat_attachments`는 유지합니다.
- 향후 신규 업로드부터 `files`에도 병행 기록하는 방식으로 확장합니다.

더 이상 사용하지 않는 예전 컬럼명:
- 없음

---

## file_links

목적:
하나의 파일을 여러 업무 엔티티와 연결하는 범용 링크 테이블입니다. 파일 자체 정보는 `files`에 두고, 업무 연결은 `file_links`에 둡니다.

| 컬럼명 | 타입 | NULL 허용 | 기본값 | 관계 | 설명 |
|---|---|---:|---|---|---|
| id | uuid | 아니오 | gen_random_uuid() | PK | 링크 고유 ID |
| file_id | uuid | 아니오 | 없음 | files.id FK | 연결 파일 |
| entity_type | text | 아니오 | 없음 | 없음 | 연결 대상 유형 |
| entity_id | uuid | 아니오 | 없음 | 없음 | 연결 대상 ID |
| link_type | text | 아니오 | attachment | 없음 | 연결 목적 |
| sort_order | integer | 아니오 | 0 | 없음 | 표시 순서 |
| created_at | timestamptz | 아니오 | now() | 없음 | 생성 시각 |

Primary Key:
- `id`

Foreign Key:
- `file_id` → `files.id` ON DELETE CASCADE

Unique Index:
- `file_links_unique_link` on `(file_id, entity_type, entity_id, link_type)`

일반 Index:
- `file_links_entity_idx`
- `file_links_file_id_idx`

RLS:
- 활성화

주요 Policy:
- `prototype file_links access`: `anon` 전체 접근 허용

entity_type 예시:
- `venue`
- `venue_space`
- `banquet_asset`
- `event_order`
- `ai_interview`
- `ai_knowledge`
- `document`
- `project`

link_type 예시:
- `base_floor_plan`
- `layout_reference`
- `asset_image`
- `chat_attachment`
- `knowledge_evidence`
- `event_attachment`

코드에서 사용되는 위치:
- 현재 migration 기준 신규 구조입니다. 이후 레이아웃 이미지 업로드 UI와 AI 추천 로직에서 사용 예정입니다.

주의사항:
- `entity_id`는 범용 UUID입니다. DB 레벨에서 각 엔티티별 FK를 강제하지 않고, 애플리케이션 레벨에서 관리합니다.
- 하나의 파일이 여러 엔티티에 연결될 수 있습니다.

더 이상 사용하지 않는 예전 컬럼명:
- 없음

---

## venue_layout_images

목적:
연회장 기본 도면 및 검증된 레이아웃 이미지를 AI가 검색/추천할 수 있도록 구조화된 운영 조건과 함께 저장합니다.

| 컬럼명 | 타입 | NULL 허용 | 기본값 | 관계 | 설명 |
|---|---|---:|---|---|---|
| id | uuid | 아니오 | gen_random_uuid() | PK | 레이아웃 이미지 고유 ID |
| file_id | uuid | 아니오 | 없음 | files.id FK | 실제 이미지/문서 파일 |
| venue_id | uuid | 예 | 없음 | venues.id FK | 운영명 기준 행사장 |
| space_id | uuid | 예 | 없음 | venue_spaces.id FK | 실제 공간 단위 |
| layout_type | text | 아니오 | 없음 | 없음 | seminar, round, buffet 등 |
| min_people | integer | 예 | 없음 | 없음 | 권장 최소 인원 |
| max_people | integer | 예 | 없음 | 없음 | 권장 최대 인원 |
| table_type | text | 예 | 없음 | 없음 | class_table, round_table 등 |
| table_count | integer | 예 | 없음 | 없음 | 테이블 수 |
| has_stage | boolean | 아니오 | false | 없음 | 무대 유무 |
| has_buffet | boolean | 아니오 | false | 없음 | 뷔페 세팅 유무 |
| has_screen | boolean | 아니오 | false | 없음 | 스크린 유무 |
| has_podium | boolean | 아니오 | false | 없음 | 포디움 유무 |
| has_registration_table | boolean | 아니오 | false | 없음 | 등록대 유무 |
| buffet_position | text | 예 | 없음 | 없음 | 뷔페 위치 설명 |
| stage_position | text | 예 | 없음 | 없음 | 무대 위치 설명 |
| layout_notes | text | 예 | 없음 | 없음 | 운영 메모 |
| source_type | text | 예 | 없음 | 없음 | event_order, manual 등 출처 유형 |
| source_id | uuid | 예 | 없음 | 없음 | 출처 ID |
| is_verified | boolean | 아니오 | false | 없음 | 검증 완료 여부 |
| verified_by | text | 예 | 없음 | 없음 | 검증자 |
| verified_at | timestamptz | 예 | 없음 | 없음 | 검증 시각 |
| is_active | boolean | 아니오 | true | 없음 | 사용 여부 |
| created_at | timestamptz | 아니오 | now() | 없음 | 생성 시각 |
| updated_at | timestamptz | 아니오 | now() | 없음 | 수정 시각 |

Primary Key:
- `id`

Foreign Key:
- `file_id` → `files.id` ON DELETE CASCADE
- `venue_id` → `venues.id` ON DELETE SET NULL
- `space_id` → `venue_spaces.id` ON DELETE SET NULL

Unique Index:
- 없음

일반 Index:
- `venue_layout_images_venue_idx`
- `venue_layout_images_space_idx`
- `venue_layout_images_people_idx`

RLS:
- 활성화

주요 Policy:
- `prototype venue_layout_images access`: `anon` 전체 접근 허용

코드에서 사용되는 위치:
- 현재 migration 기준 신규 구조입니다.
- 향후 이벤트오더 AI 분석에서 장소, 행사 유형, 인원, 뷔페/무대/테이블 조건을 기준으로 추천 이미지를 검색할 예정입니다.

주의사항:
- `venue_id` 또는 `space_id` 중 하나 이상은 반드시 있어야 합니다.
- 기본 도면은 `files` + `file_links(link_type='base_floor_plan')` 중심으로 저장하고, 운영 조건이 있는 검증 레이아웃은 `venue_layout_images`에 저장합니다.
- 기존 `layout_rules`는 수용 규칙, `venue_layout_images`는 실제 이미지/배치 예시를 담당합니다.

더 이상 사용하지 않는 예전 컬럼명:
- 없음

