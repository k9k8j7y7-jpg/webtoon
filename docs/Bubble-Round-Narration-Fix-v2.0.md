# round 말풍선 · 나레이션 바 수정 지시서 v2.0

> **대상:** Claude Code
> **파일:** `frontend/src/components/BubbleOverlay.jsx` (이 파일만)
> **참고 이미지:** `기본.jpg`
> **범위:** `round` 1종 + `narration` 1종. **나머지 10종은 손대지 않는다.**

---

## 0. 상황과 작업 철학

8-1단계에서 `ovalScale`을 제거하고 `insetX`/`insetY` 비율 방식으로 전환한 뒤 화면이 깨졌다.

확인된 증상:
1. 나레이션 바가 **둥근 모서리**로 나온다. 각진 사각형이어야 한다.
2. 나레이션 바 높이가 1줄로 고정되어 2줄째가 바 밖으로 나간다.
3. 타원 말풍선에서 텍스트가 **좌우로** 타원 밖까지 나간다.
4. 타원 말풍선에서 마지막 줄이 **아래로** 넘친다.
5. 꼬리 모양이 참고 이미지와 다르다.

### 이번 작업의 원칙 — 반드시 읽을 것

**도형과 텍스트를 분리해서 순차로 잡는다.**

지금까지 이 문제를 여러 번 고쳤는데 계속 실패한 이유는, 도형 수정과 텍스트 계산 수정을 동시에 해서 **무엇이 틀렸는지 구분할 수 없었기** 때문이다.

이번에는 순서를 지킨다.

| 순서 | 작업 | 검증 방법 |
|---|---|---|
| A | 도형만 확정 | 텍스트를 무시하고 **고정 크기**로 그려서 참고 이미지와 비교 |
| B | 텍스트 계산 | 확정된 도형에 텍스트가 들어가는지만 확인 |

A단계에서는 텍스트 계산 코드를 건드리지 마라. B단계에서는 도형 코드를 건드리지 마라.

---

## 1. 절대 규칙

### 하지 말 것
- `round`, `narration` 외 **10종 스타일을 손대지 마라.** 지금 깨져 있는 것을 알고 있다. 이번 범위가 아니다.
- 아래 상수를 변경하지 마라.
  ```
  CHAR_WIDTH = 0.55
  PADDING_X = 14
  PADDING_Y = 10
  LINE_HEIGHT_RATIO = 1.45
  ```
- `bubbleSpec.json`을 열거나 import하지 마라.
- Export / `exportRenderer.js` 관련 코드를 손대지 마라.
- `Gate5Review.jsx`를 손대지 마라.
- 새 파일, 새 컴포넌트를 만들지 마라.
- **편집 모드 UI를 만들지 마라.** 텍스트 위치·크기 조절 UI는 다음 단계(편집 모드) 작업이다.

### 반드시 지킬 것
- 폭·높이 계산 로직은 `computeSingleBubbleGeo`와 `SingleBubble` **두 곳에 중복 존재한다.** 반드시 양쪽을 동일하게 고쳐라. 한쪽만 고치면 보기 모드와 편집 모드가 어긋난다.
- 텍스트는 `foreignObject` 방식을 유지한다. `text`/`tspan`으로 바꾸지 마라.
- 각 단계가 끝나면 **멈추고 화면 확인을 요청한다.** 확인 전에 커밋하지 않는다.

---

# A단계 — 도형 확정

여기서는 텍스트 계산 코드를 **일절 건드리지 않는다.** 도형이 참고 이미지와 같아 보이는지만 본다.

---

## A-1. 나레이션 바 (`narration`)

### 잘못된 현재 상태
둥근 모서리의 긴 알약 형태로 그려지고 있다.

### 올바른 형태
화면 하단에 걸치는 **각진 사각형 바**다.

```jsx
<rect
  x={bx} y={by}
  width={needW} height={needH}
  rx={0} ry={0}
  fill={cfg.fill}
  stroke="none"
/>
```

| 항목 | 값 | 비고 |
|---|---|---|
| 모서리 반경 | `0` | **둥글게 하지 마라.** `cfg.radius`를 참조하지 말고 0을 직접 쓴다 |
| 테두리 | 없음 | 백엔드 정의가 `stroke: none` |
| 배경 | 검정 65% | 백엔드 `service.py` 값 사용 |
| 글자색 | 흰색 | |
| 꼬리 | **없음** | `isCaption`이면 꼬리 렌더링 전체를 건너뛴다 |

⚠️ `BUBBLE_CONFIGS.narration`에 `radius` 값이 남아 있다면 제거하거나 0으로 만들어라. 다른 코드 경로에서 참조될 수 있다.

⚠️ 참고 이미지 `나레이션.jpg`에는 꼬리가 있지만, **화면 하단 자막 바로 쓸 때는 꼬리를 그리지 않는다.** 복구 전 정상 상태가 그러했다.

---

## A-2. `round` 타원 + 꼬리

### 참고 이미지 실측값

`기본.jpg`를 실측한 결과다. 타원 중심 `(cx, cy)`, 반지름 `(rx, ry)` 기준.

**꼬리는 삼각형이 아니다.** 네 점으로 이루어진 **접힌 형태**다. 타원 테두리 위의 꺾임점에서 두 개의 얇은 조각이 만나 갈고리처럼 보인다. 이것이 지금 모양과 가장 크게 다른 부분이다.

| 요소 | 값 |
|---|---|
| 꼬리 중심각 `θc` | 기준각 + 18° (아래 방향이면 108°) |
| 오른쪽 부착점 `θ1` | `θc − 11°` |
| 왼쪽 부착점 `θ2` | `θc + 11°` |
| 꺾임점 `K` | `θc` 위치, 타원 테두리 **위** |
| 끝점 `T` 방향 | `θc + 39°` |
| 끝점 `T` 거리 | `needH × 0.34` |

각도는 SVG 좌표계 기준(y축이 아래로 증가). 0°가 오른쪽, 90°가 아래.

### 좌표 계산

```js
function tailBaseAngle(dir) {
  if (dir === 'up')    return -90;
  if (dir === 'left')  return 180;
  if (dir === 'right') return 0;
  return 90;                       // down (기본)
}

const SKEW = 18;      // 치우침. flipTail이면 부호 반전
const SPREAD = 11;    // 부착점 벌림
const TIP_SWEEP = 39; // 끝점이 중심각에서 더 휘는 각도
const TIP_LEN = 0.34; // needH 대비 꼬리 길이

const sign = flipTail ? -1 : 1;
const base = tailBaseAngle(tailDirection);
const thetaC = base + SKEW * sign;

const rad = d => d * Math.PI / 180;
const onEllipse = d => ({
  x: cx + rx * Math.cos(rad(d)),
  y: cy + ry * Math.sin(rad(d)),
});

const P1 = onEllipse(thetaC - SPREAD * sign);   // 오른쪽 부착점
const P2 = onEllipse(thetaC + SPREAD * sign);   // 왼쪽 부착점
const K  = onEllipse(thetaC);                    // 꺾임점 (테두리 위)

const tipAngle = thetaC + TIP_SWEEP * sign;
const tipLen = needH * TIP_LEN;
const T = {
  x: K.x + Math.cos(rad(tipAngle)) * tipLen,
  y: K.y + Math.sin(rad(tipAngle)) * tipLen,
};
```

### 단일 path로 합치기

본체와 꼬리를 **하나의 `<path>`로** 그린다. 별도 도형으로 그리면 이음새에 선이 생긴다.

```
M P1
A rx ry 0 1 0  P2      ← 타원의 긴 쪽 호 (꼬리 반대편을 크게 돌아감)
L T                      ← 왼쪽 조각의 바깥 변
L K                      ← 꺾임점으로 되돌아옴
Z                        ← P1으로 닫힘
```

⚠️ **호 플래그(`large-arc-flag`, `sweep-flag`)를 반드시 화면에서 검증하라.** 잘못 주면 타원이 뒤집히거나 짧은 쪽 호가 그려진다.

⚠️ `K`가 타원 테두리 **위**에 있어야 꼬리 밑동이 자연스럽게 좁아진다. 안쪽으로 넣지 마라.

### A단계 검증 방법

⚠️ **이 검증을 위해 텍스트 계산 코드를 수정하지 마라.** 아래처럼 임시로 확인만 한다.

1. 브라우저 개발자도구에서 SVG를 직접 보거나, 임시로 `needW = 400`, `needH = 200` 같은 고정값을 하드코딩해 렌더링한다.
2. `기본.jpg`를 옆에 띄우고 비교한다.
3. 확인이 끝나면 **하드코딩을 반드시 되돌린다.**

### 조정

위 수치는 실측 출발점이다. 참고 이미지와 비교해 조정하라.

- 꼬리가 짧으면 `TIP_LEN` 상향
- 갈고리가 덜 휘면 `TIP_SWEEP` 상향
- 밑동이 두꺼우면 `SPREAD` 하향

`tailDirection`을 `up`/`left`/`right`로 바꿔도 형태가 유지되는지, `flipTail`을 켜면 좌우가 반전되는지 확인하라.

---

## A단계 확인 항목

### 나레이션 바
- [ ] 모서리가 각진가 (둥글지 않은가)
- [ ] 테두리선이 없는가
- [ ] 꼬리가 그려지지 않는가
- [ ] 배경이 검정 반투명인가

### round
- [ ] 타원 형태가 `기본.jpg`와 닮았는가
- [ ] 꼬리가 접힌 갈고리 형태인가 (단순 삼각형이 아닌가)
- [ ] 꼬리가 본체와 하나의 윤곽선으로 이어지는가 (틈·겹친 선 없음)
- [ ] 방향을 `up`/`left`/`right`로 바꿔도 형태가 유지되는가
- [ ] `flipTail`을 켜면 좌우가 반전되는가

**→ 여기서 멈추고 확인 요청. 통과하면 커밋 후 B단계로.**

---

# B단계 — 텍스트 맞춤

A단계에서 도형이 확정된 뒤에 시작한다. **여기서는 도형 코드를 건드리지 않는다.**

---

## B-1. 나레이션 바 높이

`narration`은 사각형이다. 타원 계산을 적용하지 마라. **높이는 줄 수에 정비례한다.**

```js
// 폭은 항상 사용자 지정값 고정 (isCaption 기본 동작)
const needW = bubbleW;

// 줄바꿈
const textAreaW = needW - PADDING_X * 2;
const maxChars = Math.max(4, Math.floor(textAreaW / (fontSize * CHAR_WIDTH)));
const lines = wrapText(text, maxChars);

// 높이는 줄 수에 비례
const contentH = lines.length * fontSize * LINE_HEIGHT_RATIO + PADDING_Y * 2;

// minHeightPx는 최소값으로만 쓴다
const needH = Math.max(contentH, minHeightPx || 0);
```

⚠️ **`minHeightPx`(`bubbleH` prop)를 최대값으로 쓰지 마라.** 지금 2줄째가 잘리는 원인이 이것일 가능성이 높다. `contentH`가 더 크면 `contentH`를 쓴다.

`narration`의 `insetX` / `insetY`는 제거한다. 사각형이므로 `PADDING`만으로 충분하다.

---

## B-2. 타원 텍스트 맞춤

### 왜 비율 방식이 실패했나

중심이 같은 타원(반지름 `rx`, `ry`) 안에 폭 `w`, 높이 `h`인 사각형이 들어가려면, 사각형의 **모서리**가 타원 안에 있어야 한다.

```
(w/2 / rx)² + (h/2 / ry)² ≤ 1
```

`insetX`, `insetY`를 각 축에 따로 곱하는 방식은 이 조건을 만족하지 못한다. 가로로 긴 텍스트일수록 모서리가 밖으로 나간다. **텍스트가 좌우로 삐져나온 원인이 이것이다.**

`BUBBLE_CONFIGS.round`에서 `insetX`, `insetY`를 삭제하고 아래 방정식으로 푼다. 비율 상수를 쓰지 않는다.

(다른 10종의 inset 값은 그대로 두어라. 나중에 각 도형에 맞게 다시 정한다.)

### `fixedWidth = true`인 경우

`bubble_layout.width`가 지정된 말풍선. **게이트5 보기 모드의 기본 경로다. 여기가 가장 중요하다.**

```js
// (1) 가로 반지름 확정
const rx = bubbleW / 2;

// (2) 텍스트가 쓸 수 있는 가로 폭
//     타원 안에 사각형을 넣을 때 가로를 68%까지만 쓴다.
//     이 값이 커지면 세로 여유가 급격히 줄어 말풍선이 세로로 길어진다.
const TEXT_WIDTH_RATIO = 0.68;
const textAreaW = rx * 2 * TEXT_WIDTH_RATIO - PADDING_X * 2;

// (3) 줄바꿈
const maxChars = Math.max(4, Math.floor(textAreaW / (fontSize * CHAR_WIDTH)));
const lines = wrapText(text, maxChars);

// (4) 실제 텍스트 블록 크기
const longest = Math.max(...lines.map(l => l.length));
const textBlockW = longest * fontSize * CHAR_WIDTH;
const textBlockH = lines.length * fontSize * LINE_HEIGHT_RATIO;

// (5) 패딩 포함 반쪽 크기
const a = textBlockW / 2 + PADDING_X;
const b = textBlockH / 2 + PADDING_Y;

// (6) 타원 방정식으로 세로 반지름 역산
//     (a/rx)² + (b/ry)² = 1  →  ry = b / sqrt(1 - (a/rx)²)
const ratio = Math.min(a / rx, 0.95);      // 0.95 상한: 0으로 나누기 방지
const ry = b / Math.sqrt(1 - ratio * ratio);

// (7) 결과
const needW = bubbleW;      // 사용자 지정 폭 유지
const needH = ry * 2;
```

⚠️ **(7)에서 `needW`는 반드시 `bubbleW`를 그대로 쓴다.** 사용자가 지정한 폭을 줄이면 안 된다.

### `fixedWidth = false`인 경우

`bubble_layout`이 없어 자동 배치되는 말풍선.

```js
// (1) 최대 폭 제한
const maxBubbleW = width * 0.78;

// (2) 줄바꿈 기준 폭
const textAreaW = maxBubbleW * 0.68 - PADDING_X * 2;
const maxChars = Math.max(4, Math.floor(textAreaW / (fontSize * CHAR_WIDTH)));
const lines = wrapText(text, maxChars);

// (3) 텍스트 블록 크기
const longest = Math.max(...lines.map(l => l.length));
const textBlockW = longest * fontSize * CHAR_WIDTH;
const textBlockH = lines.length * fontSize * LINE_HEIGHT_RATIO;

// (4) 두 축에 같은 배율을 쓰면 √2가 정확한 해다.
//     rx = k·a, ry = k·b 로 두면  1/k² + 1/k² = 1  →  k = √2
const rx = (textBlockW / 2 + PADDING_X) * Math.SQRT2;
const ry = (textBlockH / 2 + PADDING_Y) * Math.SQRT2;

// (5) 최대 폭 제한 적용
let needW = rx * 2;
let needH = ry * 2;

if (needW > maxBubbleW) {
  // 폭이 잘렸으면 그 폭으로 fixedWidth 방식을 다시 한 번 돌려 높이를 재계산한다.
  // 그러지 않으면 폭만 줄고 높이가 부족해 다시 넘친다.
  needW = maxBubbleW;
  needH = /* fixedWidth 계산을 needW 기준으로 재실행한 결과 */;
}
```

### 텍스트 배치

```js
// 텍스트 블록 중심 = 도형 중심
const centerX = bx + needW / 2;
const centerY = by + needH / 2;

// foreignObject 배치
const foX = centerX - textBlockW / 2;
const foY = centerY - textBlockH / 2;
const foW = textBlockW;
const foH = textBlockH;
```

⚠️ **`foreignObject`의 폭은 `needW`가 아니라 `textBlockW`다.** 텍스트가 좌우로 넘친 원인 중 하나가, `foreignObject`를 타원 폭 전체로 잡아놓고 그 안에서 다시 줄바꿈이 일어나기 때문일 가능성이 높다. 반드시 실제 텍스트 블록 폭으로 잡아라.

⚠️ **꼬리는 이 계산에 포함하지 않는다.** 꼬리가 아래로 뻗는다고 텍스트가 위로 밀리면 안 된다.

⚠️ 텍스트 위치 오프셋(`text_offset_x/y`)은 이번 단계에서 다루지 않는다. 다음 단계(편집 모드)에서 이 계산 위에 얹는다.

---

## B단계 확인 항목

### 나레이션 바
- [ ] 1줄일 때 바 높이가 적절한가
- [ ] 2줄일 때 바가 2줄 높이로 늘어나는가
- [ ] 텍스트가 바 안에 완전히 들어가는가
- [ ] A단계에서 확정한 각진 모양이 유지되는가

### round
- [ ] 1줄 — 타원 안, 중앙
- [ ] 2줄 — 타원 안, 중앙
- [ ] 3줄 — 타원 안, 중앙
- [ ] 텍스트가 **좌우로** 타원을 벗어나지 않는가
- [ ] 텍스트가 **위아래로** 타원을 벗어나지 않는가
- [ ] 짧은 텍스트일 때 말풍선이 작아지는가 (`fixedWidth=false`)
- [ ] `bubble_layout.width` 지정 말풍선은 그 폭이 유지되는가
- [ ] A단계에서 확정한 꼬리 모양이 유지되는가

**→ 여기서 멈추고 확인 요청. 통과하면 커밋.**

---

## 2. 작업 순서 요약

| 단계 | 내용 | 종료 조건 |
|---|---|---|
| A-1 | 나레이션 바 각진 사각형 + 꼬리 제거 | 확인 요청 → 커밋 |
| A-2 | round 타원 + 접힌 갈고리 꼬리 | 확인 요청 → 커밋 |
| B-1 | 나레이션 바 높이 줄 수 비례 | 확인 요청 → 커밋 |
| B-2 | round 타원 방정식 텍스트 맞춤 | 확인 요청 → 커밋 |

한 번에 여러 단계를 하지 마라. A-1부터 시작한다.

---

## 3. 테스트 데이터

준호 에피소드: `projects/5/episodes/13` (꽃집 이야기, 12컷)

| 컷 | 검증 대상 |
|---|---|
| #1 | round 2줄 + 3줄, 나레이션 2줄 |
| #7 | `bubble_layout.width` 92% 고정폭 유지 |
| #12 | 나레이션 자막 2개 |

---

*문서 끝 — Bubble-Round-Narration-Fix v2.0*
