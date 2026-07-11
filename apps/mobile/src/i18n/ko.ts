/**
 * apps/mobile/src/i18n/ko.ts
 *
 * Centralized Korean UI strings (plan §1.3: "Korean UI strings centralized
 * ... no i18n framework in v1"). Feature workstreams should add their own
 * string groups here rather than inlining literals in screens.
 *
 * This is scaffolding only (M0) — a minimal seed set. Each owning workstream
 * (noted per group) should extend this as screens are built.
 */
export const ko = {
  common: {
    appName: "데이테일",
    loading: "불러오는 중...",
    save: "저장",
    cancel: "취소",
    delete: "삭제",
    confirm: "확인",
    error: "오류가 발생했어요",
  },
  // OWNED BY WS-B
  auth: {
    loginTitle: "소셜 로그인으로 시작하기",
    loginWithGoogle: "Google로 계속하기",
    loginWithApple: "Apple로 계속하기",
    loginWithKakao: "카카오로 계속하기",
    loginFailed: "로그인에 실패했어요. 다시 시도해주세요",
    logout: "로그아웃",
    callbackFailedTitle: "로그인을 완료하지 못했어요",
    callbackBackToLogin: "로그인 화면으로 돌아가기",
  },
  // OWNED BY WS-B
  onboarding: {
    nicknameTitle: "닉네임을 정해주세요",
    nicknamePlaceholder: "닉네임 입력",
    nicknameTaken: "이미 사용 중인 닉네임이에요",
    nicknameSubmit: "시작하기",
  },
  // OWNED BY WS-E
  diary: {
    writeTitle: "오늘의 일기",
    entryLabel: "일기",
    placeholder: "오늘 하루는 어땠나요?",
    minCharsHint: "50자 이상 작성하면 더 좋은 소설이 만들어져요",
    charCountSuffix: "자",
    saveSuccess: "일기를 저장했어요",
    saveError: "일기 저장에 실패했어요",
    linkedEpisodeNote:
      "이미 소설로 만들어진 일기예요. 지금 수정해도 기존 소설에는 반영되지 않아요",
  },
  // OWNED BY WS-F
  generate: {
    title: "소설로 만들기",
    cta: "소설로 만들기",
    pickDates: "포함할 일기를 선택하세요",
    pickGenre: "장르를 선택하세요",
    pickTone: "톤을 선택하세요",
    noEntriesAvailable: "선택할 수 있는 일기가 없어요. 먼저 오늘의 일기를 작성해보세요",
    duplicateInProgress: "이미 생성 중이에요. 완료될 때까지 기다려주세요",
    statusQueued: "대기 중이에요",
    statusProcessing: "AI가 소설을 쓰고 있어요...",
    statusAwaitingInput: "추가 정보가 필요해요",
    statusCompleted: "완성됐어요!",
    statusFailed: "생성에 실패했어요",
    clarifyTitle: "AI가 몇 가지 궁금한 점이 있어요",
    clarifySubmit: "답변 제출하기",
    retry: "다시 시도하기",
  },
  // OWNED BY WS-H
  episode: {
    publish: "공개하기",
    publishConfirm: "공개하면 모두가 볼 수 있어요. 계속할까요?",
    readOriginalDiary: "원본 일기 보기",
    titlePlaceholder: "제목을 입력하세요",
    contentPlaceholder: "내용을 입력하세요",
    save: "저장하기",
    saved: "저장했어요",
    saveFailed: "저장에 실패했어요",
    publishFailed: "공개에 실패했어요",
    generating: "AI가 소설을 쓰고 있어요. 잠시만 기다려주세요...",
    published: "공개됨",
    draft: "비공개",
    episodeNumber: "화",
    originalDiaryTitle: "원본 일기",
    originalDiaryEmpty: "연결된 일기가 없어요",
    hideOriginalDiary: "원본 일기 닫기",
    loadFailed: "에피소드를 불러오지 못했어요",
  },
  // OWNED BY WS-I
  moderation: {
    report: "신고하기",
    block: "차단하기",
    reportReasonPrompt: "신고 사유를 선택해주세요",
    reasonSpam: "스팸/광고",
    reasonAbuse: "욕설/혐오 표현",
    reasonInappropriate: "불쾌한 콘텐츠",
    reasonOther: "기타",
    reportConfirm: "이 소설을 신고할까요?",
    reportSuccess: "신고가 접수됐어요",
    reportFailed: "신고에 실패했어요",
    blockConfirm: "이 작성자를 차단할까요? 작성자의 모든 글이 보이지 않게 돼요",
    blockSuccess: "차단했어요",
    blockAlreadyBlocked: "이미 차단한 사용자예요",
    blockFailed: "차단에 실패했어요",
  },
  // OWNED BY WS-I
  profile: {
    title: "프로필",
    nicknameLabel: "닉네임",
    editNickname: "닉네임 수정",
    nicknameTaken: "이미 사용 중인 닉네임이에요",
    logoutConfirm: "로그아웃 할까요?",
    logoutFailed: "로그아웃에 실패했어요",
    blockedUsersTitle: "차단한 사용자",
    blockedUsersEmpty: "차단한 사용자가 없어요",
    unblock: "차단 해제",
    unblockConfirm: "차단을 해제할까요?",
    unblockFailed: "차단 해제에 실패했어요",
    loadFailed: "불러오지 못했어요",
  },
  // OWNED BY WS-G
  library: {
    title: "라이브러리",
    tabDraft: "초안",
    tabPrivate: "비공개",
    tabPublished: "공개",
    tabDiary: "원본",
    untitledEpisode: "제목 없음",
    emptyEpisodes: "아직 소설이 없어요",
    emptyDiary: "아직 작성한 일기가 없어요",
    deleteEpisodeConfirm: "이 소설을 삭제할까요? 되돌릴 수 없어요",
    deleteDiaryConfirm: "이 일기를 삭제할까요? 연결된 소설도 함께 삭제돼요",
    deleteFailed: "삭제에 실패했어요. 다시 시도해주세요",
  },
  // OWNED BY WS-H
  feed: {
    title: "피드",
    empty: "아직 공개된 소설이 없어요",
    loadFailed: "피드를 불러오지 못했어요",
    episodeCount: "화",
    untitledSeries: "이름 없는 시리즈",
    unknownAuthor: "알 수 없는 작가",
    seriesEmpty: "아직 공개된 화가 없어요",
    seriesLoadFailed: "시리즈를 불러오지 못했어요",
  },
} as const;
