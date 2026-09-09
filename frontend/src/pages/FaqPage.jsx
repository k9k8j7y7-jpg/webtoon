import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'EziToon은 어떤 서비스인가요?',
    a: '아이디어를 입력하면 캐릭터·장소·스타일이 일관되게 유지되는 웹툰을 AI가 자동으로 생성해주는 서비스입니다.',
  },
  {
    q: '패킷이란 무엇인가요?',
    a: '이미지 생성에 사용되는 서비스 내 단위입니다. 이미지 1건 생성 시 1패킷이 차감됩니다. 텍스트(대본·콘티) 작업은 무료입니다.',
  },
  {
    q: '이미지 생성에 실패하면 패킷이 차감되나요?',
    a: '아니요. 생성에 실패한 경우 패킷은 차감되지 않거나 자동으로 환불됩니다.',
  },
  {
    q: '생성된 웹툰의 저작권은 누구에게 있나요?',
    a: '서비스를 통해 생성한 웹툰 콘텐츠의 저작권은 이용자에게 귀속됩니다.',
  },
  {
    q: '문의는 어떻게 하나요?',
    a: 'k9k8j7y7@naver.com 으로 문의해주세요.',
  },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-2 border-border dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white dark:bg-surface-dark hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="font-bold text-sm text-ink-black dark:text-white">{item.q}</span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 border-t-2 border-border dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
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
          <a href="mailto:k9k8j7y7@naver.com" className="text-sm font-bold text-comic-blue dark:text-comic-orange hover:underline">
            1:1 문의하기
          </a>
        </div>
      </div>
    </div>
  );
}
