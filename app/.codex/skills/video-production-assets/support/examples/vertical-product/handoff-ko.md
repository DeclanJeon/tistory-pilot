# 제품 카메라 테스트 인계

3초, 24fps, 72프레임, 540×960(9:16). 상자 밑면 중심은 (0,0,0)m, 크기는 0.2×0.2×0.3m다. +X가 이 샷의 화면 오른쪽이다.

선택 A: 카메라 (-0.06,-0.55,0.32)→(+0.06,-0.55,0.32)m, target (0,0,0.15)m, 50mm/가로 게이트 36mm. 고정 렌즈와 smoothstep으로 12cm 좌→우 트럭하며 조준 방향을 보정한다. 처음·끝에 완만하게 정지한다. 키프레임 0–71은 0–2.9583초, 마지막 프레임 표시까지 총 3초다. 거리 약 0.576–0.579m, 최대 이동 속도 0.061m/s. 후보 B는 65mm 정지 샷이며 요청한 시차가 없어 제외했다.

수치 검증: valid=true, 72프레임 전부 검사, 경고 0. 전체 상자의 화면 경계 합집합은 x=0.160–0.840, y=0.235–0.715(좌하단 원점 NDC)이므로 모든 프레임에서 전체가 들어온다. 지면과 제품을 가리는 장애물은 없다. 제품 하나이므로 인물 간 180도 축은 적용하지 않았다. 투시·대역 계산 결과이며 실제 미감 검수는 남아 있다.

생성: camera_spec.json, camera_spec_smoke.json, camera-comparison.csv, analysis.json, 이 인계서. Blender 명령은 발견되지 않았고 Python bpy import도 실패했다. .blend, PNG, 영상은 생성하거나 검수하지 않았다.

Blender가 준비된 환경에서 아래를 독립 프로세스로 실행한다. 출력 폴더가 이미 있으면 새 이름을 사용한다. 먼저 버전과 180×320의 1프레임 smoke 출력을 확인한 뒤 본 검수를 진행한다.

```bash
blender --version
blender --background --factory-startup --python /root/.codex/skills/remote-skills/blender-previsualization/scripts/build_previs.py -- --spec /workspace/scratch/0ef9fa431c3d/camera-trial/camera_spec_smoke.json --output /workspace/scratch/0ef9fa431c3d/camera-trial/out-smoke --mode smoke
blender --background --factory-startup --python /root/.codex/skills/remote-skills/blender-previsualization/scripts/build_previs.py -- --spec /workspace/scratch/0ef9fa431c3d/camera-trial/camera_spec.json --output /workspace/scratch/0ef9fa431c3d/camera-trial/out-stills --mode stills
```

시작/중간/끝 PNG를 실제 열어 전체 윤곽·바닥 접촉·여백을 확인하고 .blend를 다시 열어 검수한다. 필요하면 아래로 전체 72장 PNG를 생성한다(인코딩된 영상이 아님).

```bash
blender --background --factory-startup --python /root/.codex/skills/remote-skills/blender-previsualization/scripts/build_previs.py -- --spec /workspace/scratch/0ef9fa431c3d/camera-trial/camera_spec.json --output /workspace/scratch/0ef9fa431c3d/camera-trial/out-sequence --mode sequence
```

어댑터는 Cycles CPU를 사용한다. Blender 버전·엔진 지원, 실제 제품 재질/로고/실루엣, 렌즈 왜곡·심도·조명, 현장 리그 가능성은 미검증이다.
