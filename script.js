// DOM 요소들
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
const floatingToc = document.querySelector('#floating-toc-container');
const header = document.querySelector('header');

// 모바일 메뉴 토글
mobileMenuToggle?.addEventListener('click', () => {
    mobileNavOverlay.style.display = mobileNavOverlay.style.display === 'block' ? 'none' : 'block';
});

// 모바일 오버레이 클릭시 닫기
mobileNavOverlay?.addEventListener('click', (e) => {
    if (e.target === mobileNavOverlay) {
        mobileNavOverlay.style.display = 'none';
    }
});

// 모바일 네비게이션 링크 클릭시 오버레이 닫기
const mobileNavLinks = document.querySelectorAll('.mobile-nav-overlay a');
mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        mobileNavOverlay.style.display = 'none';
    });
});

// 스크롤 이벤트 처리
let lastScrollY = window.scrollY;

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    // 헤더 숨김/표시
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
        header.style.transform = 'translateY(-100%)';
    } else {
        header.style.transform = 'translateY(0)';
    }
    
    // 플로팅 목차 표시/숨김
    if (window.innerWidth >= 1024) {
        if (currentScrollY > 300) {
            floatingToc.style.opacity = '1';
            floatingToc.style.pointerEvents = 'auto';
        } else {
            floatingToc.style.opacity = '0';
            floatingToc.style.pointerEvents = 'none';
        }
    }
    
    lastScrollY = currentScrollY;
});

// 부드러운 스크롤
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const headerHeight = header.offsetHeight;
            const targetPosition = target.offsetTop - headerHeight - 20;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// 스크롤 스파이 (현재 섹션 하이라이트)
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('#side-nav a');

function updateActiveSection() {
    const scrollPosition = window.scrollY + header.offsetHeight + 50;
    
    sections.forEach((section, index) => {
        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
            navLinks.forEach(link => link.classList.remove('active'));
            if (navLinks[index]) {
                navLinks[index].classList.add('active');
            }
        }
    });
}

window.addEventListener('scroll', updateActiveSection);

// 페이지 로드시 초기화
document.addEventListener('DOMContentLoaded', () => {
    updateActiveSection();
    
    // 초기 플로팅 목차 상태 설정
    if (floatingToc) {
        floatingToc.style.opacity = '0';
        floatingToc.style.pointerEvents = 'none';
        floatingToc.style.transition = 'opacity 0.3s ease';
    }
    
    // 헤더 초기 상태 설정
    if (header) {
        header.style.transition = 'transform 0.3s ease';
    }
});

// 채팅 위젯 토글
const chatToggle = document.querySelector('.chat-toggle');
chatToggle?.addEventListener('click', () => {
    // 여기에 채팅 위젯 열기 로직 추가
    console.log('Chat widget clicked');
    alert('채팅 기능은 준비 중입니다!');
});

// 버튼 클릭 이벤트
document.querySelectorAll('.btn-primary, .join-waitlist-btn').forEach(button => {
    button.addEventListener('click', () => {
        // 대기자 명단 가입 로직
        alert('대기자 명단에 가입해주셔서 감사합니다!');
    });
});

document.querySelectorAll('.btn-secondary').forEach(button => {
    button.addEventListener('click', () => {
        // 데모 시청 로직
        alert('데모 영상을 준비 중입니다!');
    });
});

// 카드 호버 효과 개선
document.querySelectorAll('.content-panel, .feature-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-8px)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});

// 리사이즈 이벤트 처리
window.addEventListener('resize', () => {
    // 모바일에서 데스크톱으로 전환시 모바일 메뉴 닫기
    if (window.innerWidth >= 768) {
        mobileNavOverlay.style.display = 'none';
    }
    
    // 플로팅 목차 반응형 처리
    if (window.innerWidth < 1024) {
        floatingToc.style.display = 'none';
    } else {
        floatingToc.style.display = 'block';
    }
});

// 키보드 접근성
document.addEventListener('keydown', (e) => {
    // ESC 키로 모바일 메뉴 닫기
    if (e.key === 'Escape' && mobileNavOverlay.style.display === 'block') {
        mobileNavOverlay.style.display = 'none';
    }
});