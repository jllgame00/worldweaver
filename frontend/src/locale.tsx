import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Locale = 'ko' | 'en';
export const localePreferenceKey = 'worldweaver.interfaceLocale';

export type Translation<T> = T extends (...args: infer Args) => infer Result
  ? (...args: Args) => Translation<Result>
  : T extends string
    ? string
    : T extends object
      ? { [Key in keyof T]: Translation<T[Key]> }
      : T;

export function readLocale(): Locale {
  try {
    return localStorage.getItem(localePreferenceKey) === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

const LocaleContext = createContext<{
  locale: Locale;
  changeLocale: (locale: Locale) => void;
  sessionOnly: boolean;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readLocale);
  const [sessionOnly, setSessionOnly] = useState(false);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  function changeLocale(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(localePreferenceKey, next);
      setSessionOnly(false);
    } catch {
      setSessionOnly(true);
    }
  }

  return <LocaleContext.Provider value={{ locale, changeLocale, sessionOnly }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? readLocale();
}

export function useLocalized<T>(english: T, korean: NoInfer<Translation<T>>): Translation<T> {
  return useLocale() === 'ko' ? korean : english as Translation<T>;
}

export function useFormatter() {
  const locale = useLocale();
  return {
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
    date: (value: number | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(value),
  };
}

export function LanguageSelector() {
  const preference = useContext(LocaleContext);
  if (!preference) return null;
  const { locale, changeLocale, sessionOnly } = preference;
  return <div className="interface-preference">
    <label>{locale === 'ko' ? '인터페이스 언어' : 'Interface language'}
      <select value={locale} onChange={event => changeLocale(event.target.value === 'en' ? 'en' : 'ko')}>
        <option value="ko" lang="ko">한국어</option>
        <option value="en" lang="en">English</option>
      </select>
    </label>
    {sessionOnly && <small role="status">{locale === 'ko'
      ? '언어 설정을 저장할 수 없어 이 세션에만 적용됩니다.'
      : 'Language settings could not be saved. This choice applies to the current session.'}</small>}
  </div>;
}

const diagnostics: Record<string, string> = {
  provider_not_configured: '생성 공급자의 인증 정보가 설정되지 않았습니다. 로컬 편집은 계속할 수 있습니다.',
  provider_configuration_invalid: '생성 공급자의 설정이 유효하지 않습니다. 서버 설정을 확인하세요.',
  provider_timeout: '생성 시간이 초과됐습니다. 요청 범위나 서버 시간 제한을 확인하세요.',
  provider_authentication: '생성 공급자 인증에 실패했습니다. 서버의 인증 정보와 접근 권한을 확인하세요.',
  provider_unavailable: '생성 공급자를 일시적으로 사용할 수 없습니다.',
  provider_insufficient_credits: 'ChatKHU의 크레딧이 부족합니다.',
  provider_quota: '공급자의 할당량을 사용할 수 없습니다.',
  provider_access_denied: '모델에 접근할 권한이 없습니다.',
  provider_rate_limit: '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.',
  provider_incomplete: '공급자 응답이 완성되지 않아 제안에 반영하지 않았습니다.',
  provider_content_filter: '공급자의 콘텐츠 필터로 생성이 중단됐습니다.',
  provider_output_limit: '출력 토큰 한도에 도달했습니다. 요청 범위를 줄이거나 설정을 확인하세요.',
  provider_refused: '공급자가 생성 요청을 거절했습니다. 입력을 검토하세요.',
  provider_request_rejected: '공급자가 요청을 거절했습니다. 모델의 구조화 출력 지원을 확인하세요.',
  provider_error: '생성 공급자가 요청을 완료하지 못했습니다.',
  request_failed: '서비스에 연결하지 못했습니다. 현재 작업을 유지한 채 다시 시도할 수 있습니다.',
  invalid_provider_response: '생성 결과의 형식 또는 근거가 유효하지 않습니다. 원문에서 다시 검토할 수 있습니다.',
  invalid_extraction_input: '추출할 원문과 현재 프로젝트 리비전을 확인하세요.',
  generation_input_too_large: '입력이 생성 요청 크기 한도를 초과했습니다.',
  generation_configuration_changed: '생성 설정이 바뀌었습니다. 현재 모델과 한도를 확인한 뒤 요청하세요.',
  generation_in_progress: '다른 생성 요청이 진행 중입니다.',
  duplicate_generation: '이 프로젝트 리비전을 방금 요청했습니다. 잠시 뒤 다시 시도하세요.',
  live_local_only: '실제 AI 생성은 개발 서버의 로컬 접속에서만 사용할 수 있습니다.',
  json_required: '실제 생성 요청에는 JSON이 필요합니다.',
  project_too_large: '프로젝트가 요청 크기 한도를 초과합니다.',
  invalid_project: '프로젝트 구조 또는 참조가 유효하지 않습니다.',
  invalid_coverage: '생성 결과에 입력 소재의 반영 근거가 부족합니다.',
  candidate_count: '공급자가 스토리 후보 세 개를 반환해야 합니다.',
  duplicate_directions: '생성 결과에 동일한 스토리 후보가 있습니다.',
  fact_conflict: '생성 결과가 고정 설정과 충돌합니다.',
  scenario_source: '현재 스토리를 먼저 최종 승인하세요.',
  revision_target: '수정할 시나리오 기록을 선택하고 지시를 입력하세요.',
  invalid_settings: '시나리오 생성 설정을 확인하세요.',
  invalid_scenario_response: '공급자가 유효하지 않은 시나리오 결과를 반환했습니다.',
  invalid_scenario: '제안된 시나리오가 진행 검증을 통과하지 못했습니다.',
  invalid_review_scope: '의미 검토에 사용할 현재 기록과 검토 범위를 확인하세요.',
  invalid_review_evidence: '의미 검토 결과에 출처를 확인할 수 없는 근거가 있습니다.',
  cancelled: '요청을 취소했습니다.',
  blocked_start: '시작 장면의 진입 조건을 충족할 수 없습니다.',
  no_reachable_ending: '현재 조건에서 도달 가능한 결말이 없습니다.',
  project_reference: '사용하는 기록의 ID 또는 유형이 유효하지 않습니다.',
};

export function useDiagnostic() {
  const locale = useLocale();
  return (detail: string, code?: string) => {
    if (locale === 'en') return detail;
    const key = code?.replace(/^scenario\./, '');
    return key && Object.hasOwn(diagnostics, key) ? diagnostics[key]!
      : '작업을 완료하지 못했거나 검토가 필요한 항목이 있습니다. 기술 세부 정보에서 원래 진단을 확인하세요.';
  };
}

export function DiagnosticDetails({ detail, code }: { detail: string; code?: string }) {
  const locale = useLocale();
  if (locale === 'en') return null;
  return <details className="verification-evidence"><summary>기술 세부 정보</summary>
    {code && <code>{code}</code>}<p>{detail}</p>
  </details>;
}
