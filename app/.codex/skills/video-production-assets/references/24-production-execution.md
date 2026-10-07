# 생성 경로·비용 라우팅 (온디맨드 심화)

This on-demand reference covers provider routing and cost controls for media generation. Provider/model/pricing/capabilities change; verify them when a route requires it. Codex Imagen still-image generation is explicitly exempt from usage, quota, price, and quote checks; video and other providers retain their applicable gates.

비용상 적격은 실행 승인이 아니다. 아래 included/free_allowance 경로도 [검토·실행 계약](preproduction-review.md)의 현재 버전 승인과 명시적 실행 범위를 따른다. 무료/로컬 샘플·애니매틱·내보내기는 게이트를 우회하지 않는다.

## 1. 비용 정책 (FREE-FIRST / NO-PAID-BY-DEFAULT)

사용자가 명시적으로 달리 지시하지 않으면:

- `paid_external_generation = false`
- `new_subscription_allowed = false`
- `credit_purchase_allowed = false`
- `free_or_included_only = true`

설치된 커넥터·기존 계정·트라이얼·보이는 유료 모델을 크레딧/금전 지출 허가로 해석하지 않는다.
**Codex Imagen still-image exception:** When Codex Imagen is selected for a requested still-image task, do not inspect usage, remaining allowance, plan, price, or quote; do not block on `unknown_cost` and do not require separate cost approval or a cost cap. This applies only to Codex Imagen still images. Runtime/authentication, supported inputs/outputs, destination, rights, and the requested output scope still apply; video and other providers remain under this section.

### 경로 티어 (이 순서로 평가)

1. 현재 환경에 포함된 기본 기능 — 해당 작업에 추가 결제가 없는 것.
2. 이미 연결된 기능의 포함/무료 허용량 — 현재 사용이 추가 구매 없이 검증 가능할 때만.
3. 실제 지금 이용 가능한 무료 티어/무료 크레딧 경로 — 업그레이드·구매가 필요 없는 경우만.
4. 유료 경로 — 해당 유료 실행에 대한 명시적 사용자 승인이 있은 뒤에만.

### 비용 상태 분류

| 상태 | 기본 행동 | 메모 |
|---|---|---|
| included | 비용상 적격; 별도 실행 승인 필요 | 요청 작업에 추가 결제 없음 |
| free_allowance | 현재 허용량 확인 후 비용상 적격; 별도 실행 승인 필요 | 사용 중 크레딧 소모·유료 전환 조건 확인 |
| unknown_cost | 차단 | 비용/플랜 상태를 먼저 해결 |
| paid | 차단 | 해당 범위의 명시적 사용자 승인 필요 |

### 승인 규칙

유료 경로 사용 허가는 별도 실행 계획에서 현재 견적·샷/출력 수·설정·재시도·비용 상한으로 구체화한다. **샷/블록/출력이 N개인 요청은 승인 요청 자체에 총 예상 비용 요약(N × 현재 단가 또는 확인된 견적)을 먼저 제시한다** — 요약 없이 승인을 청하지 않고, 요약에 바인딩된 승인만 유효하며 N이 바뀌면 그 승인은 stale이 된다. 단가나 견적을 확인하지 못했으면 그 경로는 `unknown_cost`이며 총액을 추측으로 채우지 않는다(위 분류 표). 플러그인 설치·로그인 상태·표시된 잔여 크레딧·최고 품질 요청·“알아서 해줘”는 지출 승인이 아니다. 상한 없는 “유료 모델 사용 가능”만으로 무제한 제출하지 않는다.

승인 범위를 보존한다: 유료 이미지 한 장 승인을 유료 영상/오디오 일반 승인으로 일반화하지 않는다. 공급자 구독 일반 승인이 있어도 해당 작업이 포함되는지·추가 크레딧이 필요한지 확인한다.

무료 경로로 실행할 수 없으면: 구매/업그레이드/유료 작업 제출을 하지 않고 SSOT·프롬프트·샷 계획·모델 요구사항·첫 프레임 명세·편집/합성 계획·QA 루브릭 등 비렌더링 작업을 전부 완성하고, 렌더링이 차단된 단계를 blocker로 명확히 보고한다. 일찍 멈추지 않고 자동으로 크레딧을 사지 않는다.

최소 지출 원칙: 더 나은 분해·합성·승인 에셋 재사용·더 짧은 생성·무료 경로로 해결되는 문제에 더 많이 쓰지 않는다.

산출물: 활성 비용 모드·적격 경로·제외된 유료/불명 경로·승인 필요 여부·무료 불가 시 대체 산출물.

## 2. 이미지 생성 경로 (정지 에셋)

이미지 생성의 기본 실행자는 `codex-imagen`이다. 캐릭터 시트·제품 시트·장소·소품·룩 프레임·스토리보드·검토 정지 이미지에 같은 기본 경로를 적용한다. 공급자 미지정 요청에서 다른 생성 서비스의 카탈로그·견적부터 탐색하지 않는다.

### 실행자 선택과 제한

1. Read the current `codex-imagen` helper instructions for authentication, reference inputs, output paths, and technical request behavior; skip usage/price/quota/quote checks.
2. If the helper, authentication, supported inputs/outputs, or destination is unavailable, report that prerequisite blocker. Never substitute another provider automatically.
3. Use another executor only when the user explicitly selects it. **Do not use Higgsfield image generation.** Credits, free allowances, model recommendations, or dedicated workflows do not override this restriction.
4. Record only confirmed model/input/output metadata. Do not add unverified provider/model facts.
5. 사용자가 직접 그린 로컬 도식/2D 검토본을 선택하면 생성 모델의 대체 결과로 위장하지 않는다. 실제 그림의 검사 범위와 생성 룩/질감 미검증을 구분한다.

### 에셋 요구 유형

캐릭터 정체성 참조 · 표정 시트 · 턴어라운드/직교 참조 · 의상 참조 · 제품 팩샷 · 정확한 로고/텍스트 제품 이미지 · 장소/환경 콘셉트 · 소품 참조 · 스타일/룩 프레임 · 스토리보드 프레임 · VFX 플레이트/텍스처/요소 · 승인 이미지의 편집/변형.

### 평가 행렬

| 필드 | 의미 |
|---|---|
| available | 도구/스킬이 지금 존재 |
| authenticated | 공급자 사용이 실제로 지금 가능 — installed에서 추론 금지 |
| reference_images | 하나 이상의 참조 입력 지원 |
| identity_strength | 반복 얼굴/캐릭터 적합성 |
| edit_strength | 승인 이미지를 전면 재생성 없이 수정 가능 |
| visual_modes | 실사·2D·3D류·스타일화 등 |
| product_fidelity | 형상/재질/제품 유용성 |
| text_logo | 정확한 텍스트/로고 유용성 — 약하면 합성 우선 |
| composition_control | 포즈/레이아웃/크롭/제어 지원 |
| batch_variants | 후보 일괄 생성 효율 |
| reproducibility | 프로젝트/모델/워크플로 메타데이터 저장 |
| speed_cost | 상대 운영 트레이드오프 |

### 우선순위

정체성/제품 충실도 → 참조 이미지 준수 → 승인 정체성을 깨지 않는 편집/반복 능력 → 요구 비주얼 모드 → 텍스트/로고 충실도 → 구도/제어 필요 → 해상도/출력 형식 → 추가 비용 → 속도.

### 절차

1. [비주얼 모드·SSOT](20-visual-mode-ssot.md)에서 모드와 에셋 요구를 받는다.
2. Bypass §1 cost-tier classification for `codex-imagen` stills; check only runtime/auth/capability. Apply cost classification only to another explicitly selected executor.
3. 에셋 패밀리별 요구를 확인한다. 대체 실행자는 사용자의 명시적 선택 없이 추가하지 않는다.
4. 정체성 핵심 에셋은 통제된 배치로 생성한다. SSOT 승인 후 공급자/모델을 함부로 바꾸지 않는다 — 바꾸면 재검증한다.
5. 승인 후 재생산 가능하도록 provider·model·workflow 메타데이터를 `project.json`의 `asset_registry` 선택 필드에 기록한다(계약 참조). 확인되지 않은 모델명을 쓰지 않는다.
6. 반복 실패 시 전략 변경: 더 강한 참조 · 재생성 대신 이미지 편집 · 합성 · 수동 정확 텍스트 오버레이. 실행자 변경은 다시 사용자 선택을 받아야 하며 위 이미지 생성 제한을 유지한다.

실행 경계: 사용자가 실제 이미지 생성을 요청했고 선택한 도구가 있으면 그 도구/스킬로 인계한다 — 이 스킬의 검토 이미지 경로는 [프리프로덕션·검토 절차](preproduction-review.md)에서 위 절차로 선택된 실행자의 계약을 따른다. 적격 경로가 없으면 정확한 에셋 프롬프트/명세와 부재 연결을 보고하고 생성된 척하지 않는다.

## 3. 영상 생성 경로 (샷 단위)

프로젝트가 아니라 샷 단위로 라우팅한다. 모델 기능·한계·가격·가용성은 빠르게 변하므로 실행 시점에 검증한다.

### 샷 요구 행렬

중요한 항목만 표시한다.

- 입력 모드: 텍스트 / 이미지 / 영상 / 다중 참조
- 정체성 충실도: low / medium / high / exact
- 제품 형상 충실도: low / medium / high / exact
- 정확한 텍스트/로고 필요: yes/no
- 반복 피사체 수
- 대사/립싱크 필요
- 모션 복잡도: simple / articulated / contact-heavy / crowd / fluid / transformation
- 카메라 요구: static / basic move / specific path / exact match
- 환경 일관성
- 길이와 핸들
- 화면비와 납품 해상도
- 모델 내 오디오 필요
- 연장/편집/인페인트 필요
- 합성 친화성
- 비용 상한
- 지연 허용
- 허용 재시도 수

### 절차

1. 각 샷을 위 행렬의 요구로 변환한다. hard 요구와 선호를 분리한다 — hard 요구를 못 채우는 모델은 보기 좋아도 부적격.
2. 공급자의 현재 카탈로그/공식 문서와 정확한 endpoint 스키마를 확인한다: 필수 필드·타입·enum, 입력/참조·오디오·편집/연장·카메라 제어, 길이·화면비·해상도·워터마크/출력/저장 제약. 실제 발견 도구가 있으면 사용한다. 같은 모델 계열에서 기능을 추론하지 않는다.
3. 실제 설정과 길이의 현재 가격·과금 기준·권리/동의·지역·개인정보/약관·납품 목적지 조건을 확인한다. 후보별 근거 URL/도구 결과·확인 시각·비용과 제약을 기록한다. 필수 schema/가격/기능이 미확인이면 준비만 완료하고 제출 전에 멈춘다. 선택한 공급자를 승인 없이 대체하지 않는다.
4. 경로를 고른다: 단일 모델 생성 · 이미지 우선 후 image-to-video · 생성 배경+합성 · 별도 연기/립싱크 패스 · 기타 하이브리드.
5. 고비용/고실패 샷은 대체 경로를 포함한다.
6. 선택 경로와 제약을 [생성 영상 QA·재시도](21-generated-video-qa-retry.md)의 재시도 절차로 인계한다.

### 라우팅 우선순위

정체성/제품 충실도 → 행동·상호작용 실현 가능성 → 요구 제어 모드 → 샷 간 연속성 → 목표 시각 품질 → 오디오/대사 필요 → 무추가비용 적격 → 속도.

산출물(샷마다): shot_id · hard 요구 · 선택 생성 모드 · 검증·가용 확인된 모델/공급자 · 적합 이유 · 알려진 한계 · 대체 경로 · 실제 도구 UI/API에서 확인해야 할 파라미터. `assets/video-model-routing-template.md` 사용.

규칙: 어떤 모델도 정체성·물리·텍스트·정확한 카메라 모션을 보장한다고 주장하지 않는다. 정확한 로고/텍스트는 적절하면 합성으로 보낸다.

## 4. 에셋 인벤토리·출처 (visual asset factory 역할)

최소한의 승인된 참조 에셋만 만든다 — 연속성 필요와 무관한 장식 보드는 만들지 않는다.

1. 브리프·각본·샷 리스트·레퍼런스 분석에서 반복 엔티티를 인벤토리한다. 캐스트 규모/티어가 정해지지 않았으면 [비주얼 모드·SSOT](20-visual-mode-ssot.md)의 티어 판정을 먼저 한다.
2. 엔티티를 분류한다: character · product · prop · location · wardrobe · look · lighting · graphic · environment.
3. 절대 표류하면 안 되는 정체성 핵심 속성과 샷별로 변할 수 있는 가변 속성을 구분한다.
4. 엔티티별 최소 참조 커버리지를 정한다:
   - 캐릭터: 중립 정면 · 3/4 · 필요 시 측면/후면 · 전신 · 의상 · 시그니처 소품 · 필요 시 표정열. 잠금: 얼굴 비율·연령대·피부/털 무늬·머리/털 형태·신체 비율·시그니처 액세서리·의상 구조.
   - 제품: 정면 팩샷 · 3/4 팩샷 · 보이는 면만 뒤/옆 · 캡/열린 상태 · 재질/반사 참조 · 스케일 참조 · 승인 로고/라벨 그래픽. 잠금: 실루엣·비율·캡 형상·재질·색·라벨 배치·로고 위치·읽히는 텍스트.
   - 장소/환경: 마스터 establishing 참조 · 핵심 건축 앵커 · 움직임이 중요하면 배치도 · 필요 시 낮/밤 또는 조명 변형. 잠금: 공간 앵커·출입구·지평선·주요 가구/소품·반복 광원.
   - 룩/조명: 정체성과 분리해 기록 — 대비·색온도·키 방향·부드러움·대기·렌즈/심도 느낌·그레인/질감 의도.
   - 그래픽/타이포: 가능하면 승인된 원본 아트워크 사용. 합성으로 보존할 수 있을 때 생성 모델에 정확한 로고/법적 문구 재그린 것을 요구하지 않는다.
5. 에셋을 `project.json`의 `asset_registry`에 등록한다 — 별도 매니페스트 파일을 만들지 않는다. 상태는 계약의 planned/available/verified/stale을 쓰고, provenance 선택 필드(entity_type·entity_id·authority·source_asset_ids·prompt·provider·model·workflow·result_asset_id)는 확인된 것만 채운다.
6. 어떤 샷이 어떤 승인 에셋을 쓰는지 `shot.asset_ids`로 기록한다. 하위 프롬프트는 ID를 참조하고 기억에서 설명을 재창조하지 않는다.
7. 정규 에셋이 바뀌면 종속 샷/프롬프트를 stale로 표시하고 그것에 의존하는 것만 재생성한다.

추론 정책: 사용자가 모든 에셋을 제공하지 않으면 주제·레퍼런스·장르·플랫폼·반복 엔티티에서 빠진 목록을 추론해 `authority=inferred`의 임시 에셋으로 둔다. 법적·사실·브랜드상 차단인 누락(정확한 로고 문구·규제 주장·정확히 일치해야 할 실존 인물 용모)은 확인한다. 그 외 명세 부족은 요청과 필요한 비교 폭에 맞는 창작 제안으로 채우고, 중요한 방향은 사용자 수락/위임에 따라 정한다 — 제안은 생성 승인이 아니다.

품질 규칙: 프로필·전신·의상·소품 상호작용이 중요한데 뷰티 이미지 하나로 충분하다고 보지 않는다. seed를 정체성 제어로 의존하지 않는다. 임시 샷 조명을 정규 정체성 참조에 굽지 않는다 — 의도된 룩 일부일 때만. 정체성 참조·스타일 참조·포즈/구도 참조를 분리한다. 로고·주장·성분 사실·패키지 텍스트를 지어내지 않는다.

## 5. 최소 충분 프리뷰와 최종 제작

실제 영상 프리뷰도 영상 실행이다. 무료/로컬/짧은 샘플·애니매틱·내보내기도 게이트를 우회하지 않고 §1 비용 정책과 [검토·실행 계약](preproduction-review.md)의 현재 버전 승인을 따른다. 승인된 에셋/검토 패키지 버전에 연결해, 판단이 필요한 동작·접촉·구도·정체성에 최소 충분한 것만 생성한다.

### 프리뷰 계획

- 판단 대상: 이 프리뷰가 판정할 구체적인 동작·접촉·구도·정체성/제품 항목과 승인된 입력 ID·버전. 지원 설정·길이가 판단 대상을 덮지 못하면 그 항목은 프리뷰 판정 범위에서 제외하고 별도로 남긴다 — 짧은 프리뷰는 뒤 구간의 동작·접촉을 증명하지 않는다.
- 실행 범위: 선택 실행자의 현재 지원 설정(길이·해상도·화면비 등 확인된 실제 값), 실시간 견적, 승인된 프리뷰 샷/출력 수, 재시도·비용 상한. 지원되지 않는 저해상도/짧은 길이를 비용 절감 기본값으로 발명하지 않으며, 미확인 설정·가격은 제출을 차단한다.
- 판정 기준: 대상별 수락/재검수 기준과 다음 단계 결정(진행·수정·경로 변경).

### 프리뷰 출력과 승격

프리뷰의 실제 출력을 [생성 영상 QA·재시도](21-generated-video-qa-retry.md)로 검사하고, 수락/수정/경로 변경을 판정한다. 프리뷰 수락은 최종 제작·과금·게시 허가가 아니다.

최종 승격 경로를 비교해 선택한다: 업스케일/확장 · 재생성/재라우팅 · 편집/합성. 같은 입력·seed의 재생성도 같은 동작·정체성을 보장하지 않으므로, 프리뷰의 성공 속성을 보존할 방법(참조·첫/마지막 프레임·분할·합성)을 경로에 포함하고 최종 결과를 다시 검수한다.

최종 실행은 승인된 최종 범위(샷 수·설정·상한)와 납품 목적지 규격을 따른다. 완성된 최종본은 정체성·동작·구도·오디오·기술 규격을 다시 검수한다 — 프리뷰 검수가 최종 검수를 대신하지 않는다.

프리뷰와 최종 범위가 하나의 승인된 `video_execution_plan`에 함께 포함된 경우 현재 입력 버전·조건·상한 안에서만 진행하고 이미 승인된 범위를 재질문하지 않는다. 그렇지 않으면 별도 최종 승인을 받는다. 입력 에셋/설정이 바뀌면 영향을 받는 계획·승인만 stale로 표시한다.
