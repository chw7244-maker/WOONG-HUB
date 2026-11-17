# Steam 계정별 라이브러리와 플레이 시간

게임 메뉴의 연결 카드 → Steam 라이브러리에서 사용합니다. Steam 로그인은 Steam OpenID 2.0으로 계정 소유를 확인하며, HUB 로그인과 별개입니다. 계정은 HUB 사용자별 최대 10개입니다. 다른 계정을 추가할 때는 Steam 로그인 화면에서 해당 계정으로 전환합니다.

1. ‘Sign in through Steam’으로 본인 계정을 확인합니다. Steam 비밀번호와 Guard 코드는 Steam 화면에만 입력합니다.
2. [Steam 사용자 Web API 키](https://steamcommunity.com/dev/apikey)를 확인·등록하고 사이트의 암호 입력창에 저장합니다. 신규 등록의 도메인은 사이트 호스트 이름을 사용합니다. Steam의 발급 조건·약관·보안 확인은 사용자가 직접 진행합니다. 키를 채팅이나 GitHub에 남기지 않습니다.
3. ‘라이브러리·시간 새로고침’을 누릅니다. 각 계정의 게임·총 플레이 시간·최근 2주·최근 실행 정보를 조회하고 이름/App ID 검색·시간/이름/실행순 정렬·플레이 필터·30개 단위 페이지를 사용합니다.
4. ‘HUB 게임으로 추가’는 기존 게임 입력 창을 엽니다. ‘기존 기록에 연결’은 선택한 기록에 SteamID/App ID 참조만 추가합니다. 제목·감상·별점·직접 기록한 시간을 덮어쓰지 않습니다. 게임 상세·카드에는 Steam 조회 시간이 별도로 표시됩니다.

## 제공 범위

공식 공개 API 호스트 `https://api.steampowered.com`의 아래 GET 경로만 사용합니다. 사용자 서비스 메서드의 인자는 `input_json`으로 보냅니다. 키는 `x-webapi-key` 헤더에만 넣고 URL·브라우저 응답·로그·공개 캐시에 넣지 않습니다.

- `/ISteamUser/GetPlayerSummaries/v2/`
- `/IPlayerService/GetOwnedGames/v1/` (`include_appinfo`, `include_played_free_games`)
- `/IPlayerService/GetRecentlyPlayedGames/v1/`

가져오는 목록은 Steam이 해당 API에 제공하는 범위입니다. 미실행 무료 게임 전체나 가족 공유·다른 스토어의 게임을 보장하지 않습니다. 게임 세부 정보나 플레이 시간을 비공개로 설정하면 정보가 제한될 수 있습니다. 누락된 시간을 0분으로 간주하지 않습니다. Steam은 분 단위로 정보를 제공하며 실시간 실행 감지나 사이트가 닫힌 동안의 자동 갱신은 제공하지 않습니다.

계정별 수동 조회는 60초 간격입니다. 응답은 최대 20,000개·8MB, 정리한 계정별 보유/최근 스냅샷 합계는 1.8MB까지 처리하며 초과 시 기존 결과를 보존하고 처리 범위 오류를 표시합니다. HTTP 401/403, 429와 Retry-After, 네트워크·잘못된 응답을 구분합니다. 실패하면 마지막 성공 결과를 보존하고 이전 조회임을 표시합니다. 최근 플레이 조회만 실패하면 보유 게임은 갱신하고 최근 조회 실패를 따로 표시합니다. 라이브러리 비공개 응답을 빈 보유 게임 0개로 바꾸지 않습니다.

## 저장과 보안

- 운영 secret `STEAM_CREDENTIALS_ENCRYPTION_KEY`: Base64로 인코딩한 무작위 32바이트 AES-GCM 키. 사이트 비밀 환경변수로만 보관합니다. 삭제·교체하면 저장된 사용자 API 키를 다시 등록해야 합니다.
- 선택적인 운영 secret `STEAM_API_KEY`: 사이트 공통 사용자 Web API 키. 사용자별 등록 키가 있으면 우선 사용합니다. 기본 운영 구성은 사용자 입력 키를 사용합니다.
- `steam_user_settings`: 사용자별 암호화한 API 키·버전·선택 계정. 평문 키는 보관하지 않습니다. AES-GCM의 추가 인증 데이터로 HUB 사용자 ID를 묶습니다. 키는 저장·검증 요청에만 브라우저에서 서버로 전송하고 저장 후 재표시하지 않습니다.
- `steam_account_links`: `(HUB 사용자 ID, SteamID)`별 계정·보유/최근 조회 결과·오류·시각·갱신 잠금. SteamID는 정밀도 손실을 피하려고 문자열로 다룹니다.
- `steam_openid_states`, `steam_openid_nonces`: 10분간의 인증 상태·재사용 방지 해시. HTTPS·HttpOnly·Secure·SameSite=Lax 브라우저 쿠키, HUB 사용자, state, 정확한 return_to, 서명 필드, 고정 제공자, 신선한 nonce를 검사합니다. Steam에 고정 주소로 `check_authentication`을 직접 요청합니다.
- 개인 API는 사이트가 주입한 HUB 신원을 요구하고 쓰기는 동일 출처 JSON으로 제한합니다. 모든 응답은 private/no-store이며, 계정별 조회 결과를 공유 캐시에 저장하지 않습니다. 연결·키 버전으로 늦은 동기화나 인증 응답의 복원을 막습니다.
- 계정 연결 해제는 해당 계정의 서버 조회 결과만 삭제하고 HUB 게임·수동 시간·감상·연결 참조는 보존합니다. 보관 키 제거는 HUB에 저장한 키를 삭제하며 Steam 자체의 키를 폐기하지 않습니다. 키를 Steam에서 폐기하면 유효한 키를 다시 등록해야 합니다.
- HUB JSON 백업은 개인 게임과 SteamID/App ID 참조만 포함합니다. API 키·인증 상태·계정 연결·전체 라이브러리 조회 결과는 포함하지 않습니다. 복원 후 본인 Steam 계정을 다시 연결·조회할 수 있습니다.
- 생성 마이그레이션 `0004`는 새 테이블만 추가합니다. 기존 개인 문서·음악·뉴스·캘린더 테이블을 변경하지 않습니다.

## 검증

자동 테스트는 실제 SQLite 마이그레이션과 가짜 Steam 응답으로 사용자 격리, OpenID 위조·만료·재사용·브라우저 바인딩, API 키 암호화, 헤더 전달, 실제 0과 누락 구분, 부분 실패, 403/429, 동시 갱신 및 늦은 응답, 기존 데이터·백업 보존을 확인합니다. 테스트 계정·응답은 운영 데이터로 배포하지 않습니다. 운영에서 사용자의 직접 Steam 로그인·Web API 키 등록 후 실제 프로필·보유 목록·총 플레이 시간·최근 2주 조회 성공과 페이지 이동을 확인했습니다. 실제 개인 계정 ID·라이브러리·시간은 소스에 저장하지 않습니다. 여러 Steam 계정의 사용자 격리는 SQLite 모의 계정으로 검증했으며 실제 두 번째 계정 승인은 사용자가 추가 연결할 때 확인합니다.

공식 근거: [Steam 커뮤니티 개발 안내](https://steamcommunity.com/dev), [OpenID 로그인](https://partner.steamgames.com/doc/features/auth), [IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService), [ISteamUser](https://partner.steamgames.com/doc/webapi/ISteamUser), [Web API 인증](https://partner.steamgames.com/doc/webapi_overview/auth), [OpenID 2.0 명세](https://www.openid.net/specs/openid-authentication-2_0.html).
