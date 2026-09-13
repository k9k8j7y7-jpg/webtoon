import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, ArrowUpCircle, ArrowDownCircle, RefreshCw, CreditCard, ShoppingCart, CheckCircle, XCircle, X } from 'lucide-react';
import api from '../api/client';

const REASON_ICON = {
  generation: ArrowDownCircle,
  refund: ArrowUpCircle,
  admin_grant: ArrowUpCircle,
  purchase: ArrowUpCircle,
};
const REASON_COLOR = {
  generation: 'text-red-500',
  refund: 'text-emerald-500',
  admin_grant: 'text-comic-blue',
  purchase: 'text-comic-orange',
};

export default function PacketsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const confirmedRef = useRef(false);
  const widgetsRef = useRef(null);
  const paymentMethodRef = useRef(null);
  const agreementRef = useRef(null);
  const PAGE_SIZE = 30;

  const load = async (offset = 0) => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/me/packets/history', {
        params: { limit: PAGE_SIZE, offset },
      });
      setData(res);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const { data: res } = await api.get('/payments/products');
      setProducts(res);
    } catch { /* ignore */ }
  };

  const loadOrders = async () => {
    try {
      const { data: res } = await api.get('/me/orders', { params: { limit: 10 } });
      setOrders(res.orders || []);
    } catch { /* ignore */ }
  };

  // 토스 결제 성공 콜백 처리
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (paymentKey && orderId && amount && !confirmedRef.current) {
      confirmedRef.current = true;
      confirmPayment(paymentKey, orderId, Number(amount));
      setSearchParams({}, { replace: true });
    }

    // 결제 실패 콜백
    const errorCode = searchParams.get('code');
    const errorMessage = searchParams.get('message');
    if (errorCode && !paymentKey) {
      console.error('[TossPay] fail callback:', errorCode, errorMessage);
      setPayResult({ type: 'fail', message: `[${errorCode}] ${errorMessage || '결제가 취소되었습니다'}` });
      setSearchParams({}, { replace: true });
    }
  }, []);

  const confirmPayment = async (paymentKey, orderId, amount) => {
    setPaying(true);
    try {
      const { data: res } = await api.post('/payments/confirm', {
        payment_key: paymentKey,
        order_id: orderId,
        amount,
      });
      if (res.status === 'paid' || res.status === 'already_paid') {
        setPayResult({
          type: 'success',
          message: res.status === 'already_paid'
            ? '이미 처리된 주문입니다'
            : `${res.packets_granted}패킷이 충전되었습니다!`,
        });
        load(0);
        loadOrders();
      }
    } catch (err) {
      setPayResult({
        type: 'fail',
        message: err.response?.data?.detail || '결제 승인에 실패했습니다',
      });
    } finally {
      setPaying(false);
    }
  };

  // 위젯 초기화
  const initWidget = async (product, orderData) => {
    setWidgetReady(false);

    // 기존 위젯 DOM 비우기
    const pmEl = document.getElementById('toss-payment-method');
    const agEl = document.getElementById('toss-agreement');
    if (pmEl) pmEl.innerHTML = '';
    if (agEl) agEl.innerHTML = '';

    try {
      const tossPayments = window.TossPayments(orderData.client_key);
      const widgets = tossPayments.widgets({ customerKey: orderData.customer_key });
      widgetsRef.current = widgets;

      await widgets.setAmount({ currency: 'KRW', value: product.amount });

      await Promise.all([
        widgets.renderPaymentMethods({
          selector: '#toss-payment-method',
          variantKey: 'DEFAULT',
        }),
        widgets.renderAgreement({
          selector: '#toss-agreement',
          variantKey: 'AGREEMENT',
        }),
      ]);

      setWidgetReady(true);
    } catch (err) {
      console.error('[TossPay] widget init error:', err);
      setPayResult({ type: 'fail', message: `위젯 초기화 실패: ${err.message}` });
      setSelectedProduct(null);
    }
  };

  const selectProduct = async (product) => {
    if (paying) return;
    setPaying(true);
    setPayResult(null);
    setSelectedProduct(product);

    try {
      const { data: orderData } = await api.post('/payments/orders', {
        product_code: product.code,
      });
      // orderData를 selectedProduct에 저장
      setSelectedProduct(prev => ({ ...prev, orderData }));
      await initWidget(product, orderData);
    } catch (err) {
      setPayResult({ type: 'fail', message: '주문 생성에 실패했습니다' });
      setSelectedProduct(null);
    } finally {
      setPaying(false);
    }
  };

  const doPayment = async () => {
    if (!widgetsRef.current || !selectedProduct?.orderData) return;
    setPaying(true);
    try {
      await widgetsRef.current.requestPayment({
        orderId: selectedProduct.orderData.order_id,
        orderName: selectedProduct.orderData.order_name,
        successUrl: `${window.location.origin}/WEBTOON/packets`,
        failUrl: `${window.location.origin}/WEBTOON/packets`,
      });
    } catch (err) {
      console.error('[TossPay] requestPayment error:', err);
      if (err.code !== 'USER_CANCEL') {
        setPayResult({ type: 'fail', message: `[${err.code || 'ERROR'}] ${err.message}` });
      }
      setSelectedProduct(null);
    } finally {
      setPaying(false);
    }
  };

  const cancelWidget = () => {
    setSelectedProduct(null);
    setWidgetReady(false);
    widgetsRef.current = null;
    const pmEl = document.getElementById('toss-payment-method');
    const agEl = document.getElementById('toss-agreement');
    if (pmEl) pmEl.innerHTML = '';
    if (agEl) agEl.innerHTML = '';
  };

  useEffect(() => { load(page * PAGE_SIZE); }, [page]);
  useEffect(() => { loadProducts(); loadOrders(); }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> 불러오는 중...
      </div>
    );
  }

  if (!data) return null;

  const totalPages = Math.ceil((data.total || 0) / PAGE_SIZE);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 결제 결과 배너 */}
      {payResult && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 border-2 ${
          payResult.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          {payResult.type === 'success'
            ? <CheckCircle size={22} className="text-emerald-500 shrink-0" />
            : <XCircle size={22} className="text-red-500 shrink-0" />
          }
          <span className={`text-sm font-bold ${
            payResult.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
          }`}>{payResult.message}</span>
          <button
            onClick={() => setPayResult(null)}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          >닫기</button>
        </div>
      )}

      {/* 잔량 카드 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 bg-comic-orange/10 dark:bg-comic-orange/20 rounded-2xl flex items-center justify-center">
          <Package size={28} className="text-comic-orange" />
        </div>
        <div>
          <div className="text-sm font-bold text-gray-500 dark:text-gray-400">보유 패킷</div>
          <div className="text-3xl font-black text-ink-black dark:text-white">
            {data.balance}<span className="text-base font-bold text-gray-400 ml-1">패킷</span>
          </div>
        </div>
      </div>

      {/* 충전 섹션 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border dark:border-zinc-800 flex items-center gap-2">
          <CreditCard size={18} className="text-comic-blue" />
          <h2 className="text-base font-bold text-ink-black dark:text-white">패킷 충전</h2>
        </div>

        {/* 상품 카드 */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {products.map(p => (
            <button
              key={p.code}
              disabled={paying || !!selectedProduct}
              onClick={() => selectProduct(p)}
              className={`relative border-2 rounded-xl p-4 text-center transition-colors disabled:opacity-50 ${
                selectedProduct?.code === p.code
                  ? 'border-comic-blue bg-comic-blue/5 dark:bg-comic-blue/10'
                  : 'border-border dark:border-zinc-700 hover:border-comic-blue dark:hover:border-comic-blue'
              }`}
            >
              <div className="text-2xl font-black text-ink-black dark:text-white">{p.packets}</div>
              <div className="text-xs font-bold text-gray-400 mb-2">패킷</div>
              <div className="text-lg font-black text-comic-blue">
                {p.amount.toLocaleString()}<span className="text-xs font-bold">원</span>
              </div>
              {p.code === 'packet_100' && (
                <div className="absolute -top-2 -right-2 bg-comic-orange text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  인기
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 토스 위젯 영역 */}
        {selectedProduct && (
          <div className="border-t border-border dark:border-zinc-800">
            <div className="px-6 py-3 flex items-center justify-between bg-gray-50 dark:bg-zinc-900/50">
              <span className="text-sm font-bold text-ink-black dark:text-white">
                {selectedProduct.packets}패킷 · {selectedProduct.amount?.toLocaleString()}원
              </span>
              <button onClick={cancelWidget} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 py-4">
              <div id="toss-payment-method" className="mb-2" />
              <div id="toss-agreement" />
            </div>
            <div className="px-4 pb-4">
              <button
                disabled={!widgetReady || paying}
                onClick={doPayment}
                className="w-full py-3 rounded-xl font-black text-white bg-comic-blue hover:bg-comic-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {paying ? (
                  <><RefreshCw size={14} className="animate-spin inline mr-1" /> 처리 중...</>
                ) : '결제하기'}
              </button>
            </div>
          </div>
        )}

        {paying && !selectedProduct && (
          <div className="px-6 py-3 text-center text-sm text-gray-400 border-t border-border dark:border-zinc-800">
            <RefreshCw size={14} className="animate-spin inline mr-1" /> 준비 중...
          </div>
        )}
      </div>

      {/* 구매 내역 */}
      {orders.length > 0 && (
        <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border dark:border-zinc-800 flex items-center gap-2">
            <ShoppingCart size={18} className="text-comic-orange" />
            <h2 className="text-base font-bold text-ink-black dark:text-white">구매 내역</h2>
          </div>
          <div className="divide-y divide-border dark:divide-zinc-800">
            {orders.map(o => (
              <div key={o.order_id} className="px-6 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-black dark:text-white">
                    {o.packet_delta}패킷
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">
                    {o.created_at ? new Date(o.created_at).toLocaleString('ko-KR') : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-ink-black dark:text-white">
                    {o.amount.toLocaleString()}원
                  </div>
                  <div className={`text-[11px] font-bold ${
                    o.status === 'paid' ? 'text-emerald-500' : o.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                  }`}>
                    {o.status_label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 사용 내역 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border dark:border-zinc-800">
          <h2 className="text-base font-bold text-ink-black dark:text-white">사용 내역</h2>
        </div>

        {data.transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            아직 내역이 없습니다
          </div>
        ) : (
          <div className="divide-y divide-border dark:divide-zinc-800">
            {data.transactions.map(tx => {
              const Icon = REASON_ICON[tx.reason] || ArrowDownCircle;
              const color = REASON_COLOR[tx.reason] || 'text-gray-400';
              const isPositive = tx.delta > 0;

              return (
                <div key={tx.id} className="px-6 py-3 flex items-center gap-3">
                  <Icon size={18} className={color} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-ink-black dark:text-white truncate">
                      {tx.reason_label}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString('ko-KR') : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isPositive ? '+' : ''}{tx.delta}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      잔액 {tx.balance_after}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 페이징 */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-border dark:border-zinc-800 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 rounded-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            >
              이전
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 rounded-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-center space-y-1">
        <p>컷 이미지 생성 = 1패킷 / 캐릭터 시트 = 2패킷 / 장소·사진 변환 = 1패킷</p>
        <p>텍스트 전용(외형 추출, 콘티 등) = 무료</p>
      </div>
    </div>
  );
}
