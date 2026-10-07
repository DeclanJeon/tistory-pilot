# Tistory Pilot

Tistory 자동화 CLI, 발행 workbench, 주제 선정·중복 방지 및 AI 영상 제작 파이프라인.

## 실행

애플리케이션 소스는 `app/`에 있다.

```bash
cd app
npm ci
npm run tistory -- --help
```

명령·설정·운영 절차는 [app/README.md](app/README.md)를 참고한다.

## 저장소와 운영 서버

- 저장소: https://github.com/DeclanJeon/tistory-pilot
- 운영 호스트: `ssh ponslink`
- 서버 애플리케이션: `/srv/publish-workbench/app`
- 로컬의 실행 소스와 package/lock 파일을 서버에 동기화한다.
- 운영 환경변수, 인증 세션, 발행 원장, 생성 원고, 작업 큐·데이터는 덮어쓰지 않는다.
- `archives/`, `backups/`, `records/`는 로컬 보관용이며 Git에서 제외한다.
- CI는 `app/`에서 의존성 설치·CLI 검증을 실행한다.

MIT License: [app/LICENSE](app/LICENSE).
