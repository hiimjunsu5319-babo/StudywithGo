# 고민지 기말 퀴즈 PWA

이 폴더는 iPhone/iPad 홈 화면에 추가해서 앱처럼 사용할 수 있는 PWA입니다.

## 실행

로컬에서 확인할 때는 이 폴더를 웹 서버로 띄워 접속하세요. `file://`로 직접 열면 퀴즈는 작동하지만, service worker 오프라인 캐시는 브라우저 정책상 등록되지 않습니다.

```powershell
cd C:\Users\user\Documents\chess\pharm-law-quiz
python -m http.server 8080
```

같은 네트워크의 iPhone/iPad에서 `http://컴퓨터IP:8080`으로 접속할 수 있습니다. 홈 화면 설치와 안정적인 PWA 동작은 HTTPS 배포 환경에서 가장 잘 작동합니다.

## iPhone/iPad 설치

1. Safari로 사이트에 접속합니다.
2. 공유 버튼을 누릅니다.
3. `홈 화면에 추가`를 선택합니다.
4. 홈 화면의 `기말퀴즈` 아이콘으로 실행합니다.

## 저장

풀이 기록은 IndexedDB에 저장됩니다. IndexedDB를 사용할 수 없는 환경에서는 localStorage에 보조 저장됩니다.

저장되는 정보:
- 맞은 문제
- 틀린 문제
- 다시 풀 문제 상태
- 풀이 날짜
- 챕터별 진행률 계산용 챕터 정보
- 공부 타이머 기록

## 오프라인

처음 한 번 정상 접속하면 `index.html`, `app.js`, `styles.css`, `questions-data.js`, 아이콘, manifest가 캐시됩니다. 이후 인터넷이 없어도 기존 문제와 풀이 기록은 로컬에서 사용할 수 있습니다.
