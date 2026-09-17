/**
 * ProductLayer — 제품 실사 사진 오버레이 (읽기 전용)
 *
 * 레이어 순서: 컷 이미지 → **제품** → 효과 → 말풍선 → 효과음
 * 좌표: x, y는 0~1 정규화 (제품 중심), width는 컷 너비 기준 0~1
 * image_url: 제품 업로드 원본 사진 경로
 */

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export default function ProductLayer({ productItems, products, width, height }) {
  if (!productItems?.length || !products?.length || !width || !height) return null;

  // product_id → product 매핑 (photo_url 조회용)
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ width, height }}
    >
      {productItems.map((item, i) => {
        const product = productMap[item.product_id];
        if (!product?.photo_url) return null;
        const w = (item.width ?? 0.3) * width;
        const rotation = item.rotation || 0;
        const opacity = item.opacity ?? 1;

        return (
          <img
            key={i}
            src={resolveUrl(product.photo_url)}
            alt=""
            style={{
              position: 'absolute',
              left: (item.x ?? 0.5) * width,
              top: (item.y ?? 0.5) * height,
              width: w,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              opacity,
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        );
      })}
    </div>
  );
}
