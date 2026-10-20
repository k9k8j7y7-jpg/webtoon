import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'EziToon은 어떤 서비스인가요?',
    a: '아이디어를 입력하면 캐릭터·장소·스타일이 일관되게 유지되는 웹툰을 AI가 자동으로 생성해주는 서비스입니다.',
  },
  {
    q: '패킷은 뭔가요?',
    a: 'AI 이미지를 만드는 데 쓰는 단위입니다. 컷 1장 = 1패킷, 컷 영상 = 4패킷, 릴스 = 1패킷. 기획·대본·콘티·말풍선·내레이션은 무료이고, 실패하면 차감되지 않습니다.',
  },
  {
    q: '한 편에 얼마 드나요?',
    a: '8컷짜리 에피소드 한 편이 패킷 8개입니다. 인기 팩(100패킷, 19,900원) 기준 한 편에 약 1,600원이에요.',
  },
  {
    q: '이미지 생성에 실패하면 패킷이 차감되나요?',
    a: '아니요. 생성에 실패한 경우 패킷은 차감되지 않거나 자동으로 환불됩니다.',
  },
  {
    q: '생성된 웹툰의 저작권은 누구에게 있나요?',
    a: '서비스를 통해 생성한 웹툰 콘텐츠의 저작권은 전적으로 창작자인 사용자 본인에게 귀속됩니다.',
  },
  {
    q: '환불은 어떻게 하나요?',
    a: '결제 후 7일 이내 사용하지 않은 패킷은 전액 환불, 사용한 패킷은 1개당 230원 공제됩니다. 1:1 문의로 요청해 주세요.',
  },
  {
    q: 'AI 그림을 인스타에 올려도 되나요?',
    a: '네, 자유롭게 올릴 수 있습니다. 인스타그램 정책에 따라 AI 생성 콘텐츠에는 \'AI 생성\' 라벨을 표시하는 것을 권장하며, EziToon 인스타 내보내기를 쓰면 크레딧이 자동으로 붙습니다.',
  },
  {
    q: '문의는 어떻게 하나요?',
    a: '1:1 문의 게시판을 이용하거나, k9k8j7y7@naver.com 으로 문의해주세요.',
  },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-card overflow-hidden !rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-transparent hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
      >
        <span className="font-bold text-sm text-ink-black dark:text-white">{item.q}</span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-border dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.a}</p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 돌아가기
        </Link>
        <h1 className="text-3xl font-bold font-serif text-ink-black dark:text-white mb-8">자주 묻는 질문</h1>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} item={item} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-400 dark:text-zinc-500">찾는 답변이 없나요?</p>
          <Link to="/inquiries/new" className="text-sm font-bold text-comic-blue dark:text-comic-orange hover:underline no-underline">
            1:1 문의하기
          </Link>
        </div>
      </div>
    </div>
  );
}
