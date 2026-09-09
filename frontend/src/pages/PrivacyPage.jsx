import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 돌아가기
        </Link>
        <h1 className="text-3xl font-bold font-serif text-ink-black dark:text-white mb-8">개인정보처리방침</h1>
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">

          <p>EziToon(이지툰, 이하 &quot;서비스&quot;)은 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를 아래와 같이 처리합니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">1. 수집하는 개인정보의 항목 및 방법</h2>

          <p><strong>(1) 회원가입 시 (소셜 로그인)</strong></p>
          <ul>
            <li>카카오: 닉네임, 소셜 계정 식별자</li>
            <li>구글: 닉네임(프로필 이름), 이메일, 소셜 계정 식별자</li>
            <li>네이버: 닉네임, 소셜 계정 식별자</li>
          </ul>
          <p>서비스는 자체적으로 비밀번호를 수집·저장하지 않습니다.</p>

          <p><strong>(2) 서비스 이용 과정에서 이용자가 직접 입력·업로드하는 정보</strong></p>
          <ul>
            <li>웹툰 제작을 위해 업로드하는 사진(인물·반려동물 등), 텍스트(대본, 캐릭터 설명, 메모 등)</li>
            <li>업로드 사진에는 이용자 본인 또는 제3자의 얼굴 등 개인을 식별할 수 있는 정보가 포함될 수 있습니다. 제3자의 사진을 업로드하는 경우 해당 제3자의 동의를 받는 것은 이용자의 책임입니다.</li>
          </ul>

          <p><strong>(3) 유료 서비스 결제 시</strong></p>
          <p>결제는 전자결제대행사(토스페이먼츠)를 통해 처리되며, 서비스는 카드번호 등 결제수단 정보를 직접 수집·저장하지 않습니다. 서비스는 결제 승인 결과(거래 식별자, 결제 금액, 일시)만을 보관합니다.</p>

          <p><strong>(4) 자동으로 수집되는 정보</strong></p>
          <ul>
            <li>접속 기록(IP, 접속 일시), 서비스 이용 기록(생성 이력 등), 브라우저 저장소의 로그인 토큰</li>
          </ul>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">2. 개인정보의 이용 목적</h2>
          <ol>
            <li>회원 식별, 로그인 유지 및 회원 관리</li>
            <li>웹툰 생성 서비스 제공 — 업로드된 사진·텍스트를 기반으로 한 캐릭터·이미지 생성</li>
            <li>패킷(이용권) 관리 및 유료 결제 처리, 결제 내역 관리</li>
            <li>공지사항 전달, 문의 응대</li>
            <li>서비스 안정성 확보, 부정 이용 방지</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">3. 개인정보의 처리 위탁 및 국외 이전</h2>
          <p>서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있습니다.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border dark:border-zinc-700">
                  <th className="text-left py-2 pr-4 font-bold">수탁자</th>
                  <th className="text-left py-2 pr-4 font-bold">위탁 업무</th>
                  <th className="text-left py-2 font-bold">비고</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border dark:border-zinc-800">
                  <td className="py-2 pr-4">Google LLC</td>
                  <td className="py-2 pr-4">AI 이미지·텍스트 생성 처리 (업로드된 사진·텍스트가 생성 처리를 위해 전송됨)</td>
                  <td className="py-2">국외(미국 등) 서버에서 처리될 수 있음</td>
                </tr>
                <tr className="border-b border-border dark:border-zinc-800">
                  <td className="py-2 pr-4">Amazon Web Services</td>
                  <td className="py-2 pr-4">서버 호스팅 및 데이터 보관</td>
                  <td className="py-2">국내(서울) 리전</td>
                </tr>
                <tr className="border-b border-border dark:border-zinc-800">
                  <td className="py-2 pr-4">토스페이먼츠(주)</td>
                  <td className="py-2 pr-4">전자결제 처리</td>
                  <td className="py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>업로드된 콘텐츠는 웹툰 생성 목적으로만 처리되며, 그 외의 목적으로 제3자에게 제공하지 않습니다. 다만 법령에 근거한 수사기관 등의 적법한 요청이 있는 경우는 예외로 합니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">4. 개인정보의 보유 및 이용 기간</h2>
          <ol>
            <li>회원 정보: 회원 탈퇴 시까지 보유하며, 탈퇴 시 지체 없이 파기합니다.</li>
            <li>업로드 콘텐츠 및 생성물: 이용자가 삭제하거나 회원 탈퇴 시 파기합니다.</li>
            <li>다만, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
              <ul>
                <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</li>
                <li>접속에 관한 기록: 3개월 (통신비밀보호법)</li>
              </ul>
            </li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">5. 개인정보의 파기</h2>
          <p>보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제합니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">6. 이용자의 권리</h2>
          <p>이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 요청은 아래 개인정보 보호책임자에게 연락하시면 지체 없이 조치합니다. 회원 탈퇴를 원하시는 경우에도 아래 연락처로 요청하실 수 있습니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">7. 개인정보의 안전성 확보 조치</h2>
          <ol>
            <li>로그인 정보는 표준 인증 토큰 방식으로 처리하며, 통신 구간은 HTTPS로 암호화됩니다.</li>
            <li>개인정보에 대한 접근은 운영자로 한정하며, 서버 접근 통제를 시행합니다.</li>
            <li>결제수단 정보는 서비스가 저장하지 않고 전자결제대행사가 처리합니다.</li>
          </ol>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">8. 개인정보 보호책임자</h2>
          <ul>
            <li>성명: 김정신</li>
            <li>연락처: k9k8j7y7@naver.com</li>
          </ul>
          <p>개인정보 처리에 관한 문의, 불만, 피해 구제는 위 연락처로 문의해 주시기 바랍니다. 또한 개인정보침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118)에 문의하실 수 있습니다.</p>

          <h2 className="text-lg font-bold text-ink-black dark:text-white">9. 개인정보처리방침의 변경</h2>
          <p>본 방침의 내용이 변경되는 경우, 시행 최소 7일 전에 서비스 내 공지사항을 통해 고지합니다.</p>

          <p className="font-bold">시행일: 2026년 9월 9일</p>
        </div>
      </div>
    </div>
  );
}
