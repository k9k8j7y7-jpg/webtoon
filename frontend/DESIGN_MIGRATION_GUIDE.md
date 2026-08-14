# 디자인 마이그레이션 작업지시서

> Layout.jsx, DashboardPage.jsx에 적용된 코믹북 비비드 디자인을 나머지 모든 페이지/컴포넌트에 일관되게 적용하는 작업

## 이미 완료된 파일 (참조용 — 수정하지 마세요)

- `src/index.css` — 디자인 토큰 정의 완료
- `src/components/Layout.jsx` — 헤더 적용 완료
- `src/pages/DashboardPage.jsx` — 대시보드 적용 완료

## 작업 대상 파일 (총 9개)

1. `src/pages/LoginPage.jsx`
2. `src/pages/ProjectPage.jsx`
3. `src/pages/WorkflowPage.jsx`
4. `src/components/GateProgress.jsx`
5. `src/components/JobProgress.jsx`
6. `src/components/gates/Gate1Planning.jsx`
7. `src/components/gates/Gate2Script.jsx`
8. `src/components/gates/Gate3Assets.jsx`
9. `src/components/gates/Gate4Storyboard.jsx`
10. `src/components/gates/Gate5Review.jsx`

---

## 디자인 토큰 (index.css에 정의됨)

```
--color-primary: #FF5722        → comic-orange
--color-ink-black: #121212      → ink-black
--color-comic-orange: #FF5722   → comic-orange
--color-comic-blue: #2563EB     → comic-blue
--color-border: #dfe4dc         → border
--color-surface: #ffffff        → surface
--color-surface-dark: #121212   → surface-dark

--font-sans: 'Pretendard'       → font-sans (본문)
--font-serif: 'Playfair Display' → font-serif (제목/브랜드)
```

---

## 변환 규칙

### 1. 색상 변환표

| 기존 (indigo 계열) | 변환 후 | 비고 |
|---|---|---|
| `bg-white` | `bg-white dark:bg-surface-dark` | 항상 다크모드 추가 |
| `text-gray-900` | `text-ink-black dark:text-white` | 주요 텍스트 |
| `text-gray-700` | `text-gray-700 dark:text-gray-300` | 본문 텍스트 |
| `text-gray-500` | `text-gray-500 dark:text-gray-400` | 보조 텍스트 |
| `text-gray-400` | `text-gray-400 dark:text-zinc-500` | 플레이스홀더 |
| `border border-gray-200` | `border-2 border-border dark:border-zinc-800` | border 토큰 사용 |
| `border-gray-300` | `border-2 border-border dark:border-zinc-700` | input 테두리 |
| `bg-indigo-600 hover:bg-indigo-700` | `bg-ink-black hover:bg-comic-blue dark:bg-white dark:text-ink-black dark:hover:bg-comic-orange` | 주요 액션 버튼 |
| `bg-indigo-600 text-white` | `bg-comic-orange text-white` | 또는 ink-black 스타일 |
| `focus:ring-indigo-500` | `focus:ring-4 focus:ring-comic-orange/20 focus:border-comic-orange` | input 포커스 |
| `hover:border-indigo-300 hover:bg-indigo-50` | `hover:border-comic-orange hover:bg-comic-orange/5` | 호버 상태 |
| `ring-2 ring-indigo-400` | `ring-2 ring-comic-orange` | 선택 상태 |
| `border-l-2 border-indigo-200` | `border-l-2 border-comic-blue/30` | 왼쪽 악센트 |
| `bg-indigo-50 text-indigo-600` | `bg-comic-blue/10 text-comic-blue` | 배지/태그 |
| `bg-indigo-50 border-indigo-200` | `bg-comic-orange/5 border-comic-orange/30` | 진행 상태 컨테이너 |
| `bg-gradient-to-br from-indigo-50 to-purple-50` | `bg-transparent` | 페이지 배경 (body에 모눈 있음) |
| `bg-gradient-to-r from-indigo-50 to-purple-50` | `bg-gradient-to-r from-comic-orange/5 to-comic-blue/5` | 배너/강조 영역 |
| `bg-indigo-100` | `bg-comic-orange/10` | 아이콘 배경 |
| `text-indigo-600` | `text-comic-orange` | 강조 아이콘 |
| `text-indigo-400` | `text-comic-blue` | 보조 아이콘 |
| `text-indigo-500` | `text-comic-blue` | |
| `text-indigo-700` | `text-comic-orange` | |

### 2. 유지할 시맨틱 색상 (변경하지 않음)

| 색상 | 용도 | 다크모드 추가만 |
|---|---|---|
| `bg-green-500/600` | 승인(approved) 상태 | `dark:bg-green-600` |
| `text-green-600` | 승인 텍스트 | `dark:text-green-400` |
| `bg-amber-500/50` | 경고/무효화(invalidated) | 유지 |
| `text-amber-600/800` | 경고 텍스트 | 유지 |
| `text-red-500` | 에러 | `dark:text-red-400` |
| `bg-purple-600` | 캐릭터 관련 | 유지 |
| `bg-emerald-600` | 장소 관련 | 유지 |

### 3. 버튼 스타일 변환

| 기존 | 변환 후 |
|---|---|
| `rounded-lg font-medium` | `rounded-full font-bold` |
| `px-4 py-2` | `px-5 py-2.5` |
| (없음) | `hover:-translate-y-0.5 transition-all shadow-sm` 추가 |

**주요 버튼 (생성/시작):**
```
기존: bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700
변환: bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm
```

**승인 버튼 (게이트 승인):**
```
기존: bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700
변환: bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm
```

**보조 버튼 (내보내기 등):**
```
기존: bg-gray-100 text-gray-700 hover:bg-gray-200
변환: bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full font-bold
```

### 4. 카드/컨테이너 변환

```
기존: bg-white rounded-xl border p-6
변환: bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm
```

```
기존: shadow-xl (LoginPage 카드)
변환: shadow-md
```

### 5. 폰트 변환

| 기존 | 변환 후 | 적용 대상 |
|---|---|---|
| `text-2xl font-bold` | `text-2xl font-bold font-serif` | 페이지 제목 (h1) |
| `text-lg font-bold` / `font-semibold` | `text-lg font-bold font-serif` | 섹션 제목 |
| `font-medium` (버튼) | `font-bold` | 모든 버튼 |
| `font-semibold` (카드 제목) | `font-bold font-serif` | 카드 내 제목 |

### 6. Input 변환

```
기존: border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500
변환: border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all font-bold
```

---

## 파일별 세부 지침

### LoginPage.jsx
- 페이지 배경 `bg-gradient-to-br from-indigo-50 to-purple-50` → `bg-transparent` (body 모눈 배경 활용)
- 카드 `bg-white rounded-2xl shadow-xl` → `bg-white/80 dark:bg-surface-dark/80 backdrop-blur-sm border-2 border-border dark:border-zinc-800 rounded-2xl shadow-md`
- 아이콘 래퍼 `bg-indigo-100` → `bg-comic-orange/10`, 아이콘 `text-indigo-600` → `text-comic-orange`
- "Project T" 제목에 `font-serif` 추가
- 로그인 버튼: ink-black 스타일 또는 comic-orange 스타일 적용
- input focus 변환

### ProjectPage.jsx
- 제목 `text-gray-900` → `text-ink-black dark:text-white font-serif`
- "+ 새 에피소드" 버튼: ink-black 라운드 스타일
- 온보딩 가이드 영역: 그라데이션을 comic-orange/blue 계열로
- 예시 아이디어 호버: `hover:border-comic-orange hover:bg-comic-orange/5`
- CTA 버튼: `bg-indigo-600` → `bg-ink-black` 또는 `bg-comic-orange`
- 에피소드 카드: 2px border, rounded-2xl, hover 시 lift + comic-orange border
- Play 아이콘: `text-indigo-400` → `text-comic-blue`

### GateProgress.jsx
- `bg-indigo-500` (draft) → `bg-comic-blue`
- `ring-indigo-300` (active) → `ring-comic-orange`

### JobProgress.jsx
- 전체 indigo 계열 → comic-orange 또는 comic-blue 계열
- `bg-indigo-50 border-indigo-200` → `bg-comic-orange/5 border-comic-orange/30`
- 프로그레스 바: `bg-indigo-500` → `bg-comic-orange`
- 텍스트: `text-indigo-700` → `text-comic-orange`

### Gate1Planning.jsx
- 카드 border, 다크모드 추가
- textarea input 스타일 변환
- 생성 버튼: ink-black 스타일, 라운드
- 승인 버튼: green 유지, 라운드 + lift
- 제목에 font-serif 추가

### Gate2Script.jsx
- 카드/섹션 border, 다크모드
- `border-l-2 border-indigo-200` → `border-l-2 border-comic-blue/30`
- `bg-indigo-50 text-indigo-600` (컷 번호 배지) → `bg-comic-blue/10 text-comic-blue`
- 생성/승인 버튼 변환

### Gate3Assets.jsx
- 카드 border, 다크모드
- 스타일 선택 버튼: `bg-indigo-50 border-indigo-300 text-indigo-700` → `bg-comic-orange/10 border-comic-orange text-comic-orange`
- 미선택: `hover:border-indigo-200` → `hover:border-comic-orange/50`
- purple/emerald 색상은 유지 (시맨틱)

### Gate4Storyboard.jsx
- 카드 border, 다크모드
- 생성 버튼: `bg-orange-600` → `bg-ink-black hover:bg-comic-blue` 또는 유지
- amber 경고/무효화 색상 유지

### Gate5Review.jsx
- 카드 border, 다크모드
- `ring-2 ring-indigo-400` → `ring-2 ring-comic-orange`
- 생성 버튼: ink-black 스타일
- 재생성 버튼: `bg-indigo-50 text-indigo-600` → `bg-comic-blue/10 text-comic-blue`
- 내보내기 버튼: 보조 버튼 스타일

---

## 주의사항

1. **다크모드 필수** — 모든 요소에 `dark:` 변형 추가
2. **font-serif는 제목에만** — 본문/버튼은 font-sans (Pretendard)
3. **font-bold 통일** — font-medium, font-semibold 대신 font-bold 사용
4. **rounded-full** — 버튼에만 적용. 카드는 rounded-2xl 사용
5. **hover:-translate-y-0.5** — 클릭 가능한 카드와 주요 버튼에 적용
6. **backdrop-blur-sm** — 글래스모피즘 효과는 주요 카드에만 선택적 적용
7. **border-2** — border 대신 border-2로 두께 통일
8. **기능은 절대 변경하지 마세요** — 순수 디자인(className)만 변경
9. **index.css, Layout.jsx, DashboardPage.jsx는 수정하지 마세요** — 이미 완료됨
