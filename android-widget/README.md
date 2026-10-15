# Banquet Board Widget V1

Android 홈 화면에서 웹 운영보드와 같은 오늘의 미완료 연회 운영 일정을 보여주는 Kotlin + Jetpack Glance 위젯입니다. `event_schedules`와 `operation_board_items`의 기존 완료/manual task 상태를 함께 읽습니다.

## 기능

- Small / Medium / Large 반응형 Glance 위젯
- `Asia/Seoul` 기준 오늘 일정
- 캐시 우선 표시 후 최신 데이터 갱신
- 1시간 WorkManager 자동 갱신 및 즉시 새로고침
- 오프라인 시 마지막 정상 캐시 유지
- 위젯/전체보기 클릭 시 `https://banquet-erp.vercel.app/board/` 열기
- Front, Check In/Out 제외 및 Firenze 식사 일정 규칙
- 최대 8개 표시 및 초과 일정 건수 안내

## 완료 체크

위젯은 읽기 전용이며, 웹 운영보드가 사용하는 `operation_board_items.is_completed`와 동일한 `item_key`를 조회합니다. 운영보드에서 완료한 일정은 다음 위젯 갱신 때 제외됩니다.

## 빌드

JDK 17과 Android SDK 35가 필요합니다. `local.properties`에 아래 값을 설정합니다. anon key만 사용하며 service role key는 사용하지 않습니다.

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
supabase.anonKey=YOUR_EXISTING_WEB_ANON_KEY
```

```powershell
.\gradlew.bat :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

