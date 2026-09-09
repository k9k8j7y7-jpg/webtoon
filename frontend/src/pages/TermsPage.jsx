import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 돌아가기
        </Link>
        <h1 className="text-3xl font-bold font-serif text-ink-black dark:text-white mb-8">이용약관</h1>
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제1조 (목적)</h2>
          <p>본 약관은 EziToon(이지툰, 이하 &quot;서비스&quot;)이 제공하는 AI 웹툰 생성 서비스의 이용과 관련하여 서비스와 회원 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제2조 (정의)</h2>
          <ol>
            <li>&quot;서비스&quot;란 이용자가 업로드한 사진·텍스트를 기반으로 AI 기술을 활용하여 웹툰 콘텐츠를 생성·편집·내보내기할 수 있도록 제공되는 제반 기능을 말합니다.</li>
            <li>&quot;회원&quot;이란 본 약관에 동의하고 소셜 계정(카카오, 구글, 네이버)으로 가입하여 서비스를 이용하는 자를 말합니다.</li>
            <li>&quot;패킷&quot;이란 AI 이미지 생성 기능을 이용하기 위해 서비스 내에서 사용되는 이용권 단위를 말합니다.</li>
            <li>&quot;생성물&quot;이란 회원이 서비스를 이용하여 만들어낸 웹툰 이미지, 에피소드 등 결과 콘텐츠를 말합니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제3조 (약관의 효력 및 변경)</h2>
          <ol>
            <li>본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.</li>
            <li>서비스는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 명시하여 적용일 최소 7일 전(회원에게 불리한 변경은 30일 전)에 공지합니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제4조 (회원가입 및 계정)</h2>
          <ol>
            <li>회원가입은 소셜 계정(카카오, 구글, 네이버) 인증을 통해 이루어집니다.</li>
            <li>각 소셜 제공자별로 별도의 계정이 생성되며, 계정 간 데이터는 연동되지 않습니다.</li>
            <li>회원은 자신의 계정을 제3자에게 이용하게 해서는 안 되며, 계정 관리 소홀로 발생한 불이익은 회원에게 책임이 있습니다.</li>
            <li>만 14세 미만은 서비스에 가입할 수 없습니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제5조 (서비스의 내용 및 AI 생성물의 특성)</h2>
          <ol>
            <li>서비스는 AI 기술을 이용하여 콘텐츠를 생성하며, 그 특성상 다음을 보증하지 않습니다.
              <ul>
                <li>동일한 입력에 대해 동일한 결과물이 생성되는 것</li>
                <li>생성물이 회원의 기대, 특정 품질 수준 또는 특정 용도에 부합하는 것</li>
              </ul>
            </li>
            <li>생성 요청이 시스템 오류로 실패한 경우 해당 요청에 대한 패킷은 차감되지 않거나 자동 환급됩니다.</li>
            <li>서비스는 기능의 추가, 변경, 개선을 위해 서비스의 내용을 변경할 수 있습니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제6조 (패킷 및 결제)</h2>
          <ol>
            <li>패킷은 AI 이미지 생성 1회당 1개가 차감되는 것을 기본으로 하며, 기능별 차감량은 해당 기능 화면에 표시됩니다.</li>
            <li>패킷은 서비스가 정한 묶음 단위로 구매할 수 있으며, 결제는 전자결제대행사를 통해 처리됩니다.</li>
            <li>구매한 패킷의 유효기간은 구매일로부터 5년으로 합니다.</li>
            <li>환불은 다음 기준에 따릅니다.
              <ul>
                <li>미사용 패킷: 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 구매일로부터 7일 이내 청약철회(전액 환불)가 가능합니다.</li>
                <li>일부 사용한 경우: 사용분을 차감한 잔여분에 대해 환불이 가능하며, 결제 수수료 등 실비가 공제될 수 있습니다.</li>
                <li>이미 사용된 패킷(이미지 생성이 정상 완료된 경우)은 환불 대상이 아닙니다. AI 생성물의 품질·취향 불일치는 제5조 1항의 특성에 따라 환불 사유에 해당하지 않습니다.</li>
              </ul>
            </li>
            <li>무상으로 지급된 패킷은 환불 대상이 아니며, 서비스가 정한 조건에 따라 소멸될 수 있습니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제7조 (콘텐츠에 대한 권리와 책임)</h2>
          <ol>
            <li>회원이 업로드하는 사진·텍스트에 대한 권리와 책임은 회원에게 있습니다. 회원은 타인의 초상권, 저작권 등 제3자의 권리를 침해하지 않는 콘텐츠만 업로드해야 하며, 제3자의 사진을 사용하는 경우 그 동의를 받을 책임은 회원에게 있습니다.</li>
            <li>회원이 서비스를 이용하여 만든 생성물은 회원이 이용할 수 있습니다. 단, 생성물의 이용에 따르는 법적 책임(타인의 권리 침해 등)은 회원에게 있습니다.</li>
            <li>서비스는 회원의 업로드 콘텐츠와 생성물을 서비스 제공(생성 처리, 저장, 표시) 목적으로만 사용합니다. 갤러리 등 서비스 홍보 목적의 노출은 회원의 별도 동의(작품별 노출 설정)를 받은 경우에 한합니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제8조 (금지행위)</h2>
          <p>회원은 다음 행위를 해서는 안 됩니다.</p>
          <ol>
            <li>타인의 사진·개인정보를 동의 없이 이용하는 행위</li>
            <li>타인의 저작권, 초상권 등 권리를 침해하는 콘텐츠의 생성·이용</li>
            <li>음란물, 아동·청소년 대상 성착취물, 혐오·차별·폭력 조장 등 위법하거나 부적절한 콘텐츠의 생성 시도</li>
            <li>서비스의 정상적인 운영을 방해하는 행위(비정상적 대량 요청, 시스템 취약점 이용 등)</li>
            <li>계정 양도, 판매, 대여 행위</li>
          </ol>
          <p>위반 시 서비스는 사전 통지 후(긴급한 경우 사후 통지) 이용 제한, 콘텐츠 삭제, 계약 해지 등의 조치를 할 수 있습니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제9조 (서비스의 중단)</h2>
          <ol>
            <li>서비스는 시스템 점검, 장애, 외부 API 제공사의 사정 등 부득이한 경우 서비스 제공을 일시 중단할 수 있으며, 예정된 중단은 사전에 공지합니다.</li>
            <li>서비스를 종료하는 경우 30일 전에 공지하며, 미사용 유료 패킷은 환불합니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제10조 (면책)</h2>
          <ol>
            <li>서비스는 천재지변, 외부 API 제공사의 장애 등 서비스의 통제 범위를 벗어난 사유로 인한 손해에 대해 책임을 지지 않습니다.</li>
            <li>서비스는 회원이 업로드한 콘텐츠 및 생성물의 내용, 그 이용으로 인한 분쟁에 대해 개입하지 않으며 책임을 지지 않습니다. 단, 서비스의 고의 또는 중대한 과실로 인한 경우는 예외로 합니다.</li>
            <li>무료로 제공되는 기능의 하자에 대해서는 관련 법령에 특별한 규정이 없는 한 책임을 지지 않습니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제11조 (해지 및 탈퇴)</h2>
          <ol>
            <li>회원은 언제든지 탈퇴를 요청할 수 있으며, 탈퇴 시 회원의 데이터는 개인정보처리방침에 따라 파기됩니다.</li>
            <li>탈퇴 시 잔여 패킷의 환불은 제6조 4항의 기준에 따릅니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">제12조 (분쟁 해결 및 준거법)</h2>
          <ol>
            <li>서비스와 회원 간 분쟁은 상호 협의로 해결하는 것을 원칙으로 합니다.</li>
            <li>본 약관은 대한민국 법률에 따라 해석되며, 분쟁에 관한 소송은 민사소송법상의 관할 법원에 제기합니다.</li>
          </ol>

          <p className="font-bold">부칙: 본 약관은 2026년 9월 9일부터 시행합니다.</p>
        </div>
      </div>
    </div>
  );
}
