# Spotify 계정 연동

기존 음악 컬렉션 위에 Spotify 계정 카드와 실시간 플레이어·라이브러리를 추가합니다. 홈에는 컴팩트 플레이어를 더하며 기존 위젯, HUB 문서, MusicBrainz 검색, 수동 감상과 즐겨찾기는 유지합니다.

## 운영 설정

Sites의 런타임 환경변수를 사용합니다. 소스·브라우저 번들·HUB 백업에는 값을 넣지 않습니다.

- `SPOTIFY_CLIENT_ID`: Spotify 앱 Client ID
- `SPOTIFY_CLIENT_SECRET`: 비밀 값으로 등록
- `SPOTIFY_REDIRECT_URI`: `https://woong-personal-hub.woong22222.chatgpt.site/api/spotify/callback`
- `SPOTIFY_TOKEN_ENCRYPTION_KEY`: 별도 생성한 32바이트 키의 Base64 값, 비밀 값으로 등록. 이미 저장한 연결이 있을 때 임의로 교체하면 다시 연결해야 합니다.

Spotify Developer Dashboard에 정확히 같은 Redirect URI와 사용할 API(Web API, Web Playback SDK)를 등록합니다. Development Mode의 앱 소유자는 Premium이 필요하며 사용할 계정은 허용 사용자에 등록해야 합니다. 2026년 7월 변경 기준 Client ID는 개발자당 최대 25개이며, 개발 모드 API 할당량은 개발자 계정 단위로 공유됩니다. 신규 허용 사용자는 앱당 5명 제한을 확인합니다.

## 인증과 권한

- 서버의 Authorization Code Flow, 무작위 state와 별도의 HttpOnly/Secure/SameSite=Lax 브라우저 쿠키, 10분 유효기간, 일회용 소비, HUB 사용자 ID 결합을 적용합니다. 콜백은 지정된 HTTPS 주소에서만 받습니다.
- 기본 로그인은 `user-read-private`만 요청합니다. ‘사용할 기능 연결’에서 선택한 기능만 추가할 수 있으며 편집 권한은 기본 선택하지 않습니다.
- 플레이어: `user-read-playback-state`, `user-modify-playback-state`.
- 브라우저 재생: 위 재생 권한에 `streaming`, `user-read-email`, `user-read-private`. SDK 공식 요구 권한이며 이메일을 별도로 보관하지 않습니다.
- 라이브러리: `playlist-read-private`, `playlist-read-collaborative`, `user-read-recently-played`, `user-top-read`.
- 플레이리스트 편집: `playlist-modify-private`, `playlist-modify-public`. 실제 변경은 각 생성·수정·추가·제거 폼의 명시적 제출에서만 실행합니다.

`spotify_connections`에 사용자별 Access/Refresh Token을 AES-256-GCM으로 암호화하고 사용자 ID를 추가 인증 데이터로 결합합니다. 만료 60초 전 갱신, DB 갱신 잠금, 변경 버전 비교, Refresh Token 회전과 기존 값 보존을 지원합니다. 인증 코드·토큰·Client Secret을 로그로 출력하지 않습니다. 다른 기기에서 연결을 해제하거나 새 인증을 시작한 경우 늦은 콜백·갱신이 연결을 복구하지 못하도록 검사합니다.

Client Secret과 Refresh Token은 서버에만 있습니다. Web Playback SDK에는 동작상 필요한 단기 Access Token만 같은 출처의 인증된 POST 응답으로 전달하며 메모리에서만 사용합니다. localStorage·쿠키·백업에 토큰을 저장하지 않습니다. 사이트 접근 권한은 Sites가, Spotify 권한은 Spotify OAuth가 각각 관리합니다.

연결 해제는 해당 HUB 계정의 Spotify 연결·인증 요청·명령 중복 방지 자료만 삭제합니다. Spotify 앱 자체의 접근 승인 철회는 Spotify 계정의 앱 관리에서 수행할 수 있습니다. 기존 HUB 기록과 Spotify 플레이리스트는 삭제하지 않습니다.

## API와 재생

서버는 고정된 Spotify 호스트와 작업 목록만 사용하며 임의 URL 프록시를 제공하지 않습니다. 브라우저의 명령은 동일 출처·JSON·HUB 사용자 신원·입력·필요 권한을 검사합니다. 개인 자료는 공개 캐시나 빌드 산출물에 넣지 않습니다.

- `/me/player`, `/me/player/devices`와 공식 Player 제어 경로를 사용합니다. `204`는 재생 항목 없음으로 처리합니다.
- `/me/playlists`, `/me/player/recently-played`, `/me/top/{tracks|artists}`, `/search`를 사용합니다. 검색은 페이지당 최대 10개, 목록·최근 재생은 최대 20개를 표시하며 다음 페이지를 제공합니다.
- 2026년 경로인 `POST /me/playlists`, `/playlists/{id}/items`를 사용합니다. 항목 응답의 `item`을 읽고 기존 응답의 `track`도 처리합니다. 다른 사람의 비공동 목록은 메타데이터만 표시합니다. 편집은 소유한 목록으로 한정하며 새 목록은 비공개로 만듭니다.
- 사라진 profile `product`·`email`, popularity·followers 등으로 동작을 결정하지 않습니다. 계정 연결에는 있으면 안정적인 `account_id`를 보관하고, API의 소유권 검사는 `id`를 사용합니다.
- ‘자주 듣는 음악’은 Spotify가 제공한 선호도 순위입니다. 실제 재생 횟수·AI 분석·오디오 분석으로 표시하지 않습니다.
- Spotify의 곡·표지에는 원본 링크와 공식 로고를 표시합니다. 새 카드의 표지를 자르거나 덮어 쓰지 않으며 explicit 표기를 제공합니다. 재생 자체를 감상 완료로 추정하거나 기존 감상 기록에 자동으로 저장하지 않습니다.

재생 상태는 연결·권한이 있을 때 표시하고 보이는 화면에서 15초 간격으로 갱신합니다. 기기 목록은 명시적 조회와 브라우저 기기 준비 시 확인합니다. SDK는 사용자가 브라우저 재생을 요청할 때 로드하며 기본 출력 기기를 자동으로 변경하지 않습니다. 준비 후 ‘이 브라우저로 전환’은 사용자 제스처로 재생을 활성화하고 기기를 전환합니다. 음악은 재생 버튼으로 시작합니다.

`401`은 서버에서 토큰을 한 번 갱신하며 계속 거부되면 재연결을 안내합니다. `403`은 Premium·허용 사용자·승인 권한을 안내하며 성공이나 빈 목록으로 바꾸지 않습니다. `429`는 `Retry-After`와 `QUOTA_EXCEEDED`를 처리하고 연결별 대기 시각을 저장해 요청을 멈춥니다. 실패한 갱신에서는 이전 표시가 최신인 것처럼 보이지 않도록 안내합니다.

각 쓰기 요청은 사용자별 request ID로 24시간 중복 방지합니다. 네트워크 오류나 처리 중단 뒤 결과가 불명확한 skip·생성·추가 명령을 자동 재전송하지 않습니다. 사용자가 새로고침으로 실제 상태를 확인한 뒤 다시 요청해야 합니다.

## 확인 범위

OAuth·암호화·갱신·계정 분리·늦은 응답·중복 명령·공식 API 경로와 오류 처리는 실제 SQLite와 제공자 응답 테스트로 확인합니다. 운영 OAuth와 실제 Spotify 프로필 조회도 확인했습니다. 실제 개인 재생 제어·브라우저 오디오 출력·플레이리스트 쓰기는 별도 사용자 동작으로 확인하며 테스트를 위해 사용자 목록을 임의 변경하지 않습니다.

## 공식 문서

- [Authorization Code Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- [Refreshing tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens)
- [2026 Development Mode migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [May 2026 changes](https://developer.spotify.com/documentation/web-api/references/changes/may-2026)
- [July 2026 changes](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
- [Web Playback SDK reference](https://developer.spotify.com/documentation/web-playback-sdk/reference)
- [Design and attribution](https://developer.spotify.com/documentation/design)
