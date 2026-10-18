// 웹 데이터 불러오기 — 정적 파일(public/data/)만 읽는다. 서버 요청·로그인 없음
import { useEffect, useState } from 'react';
import type { Project, Timeline, WebIndex } from './types';

const DATA_ROOT = `${import.meta.env.BASE_URL}data/`;

/** 데이터 폴더 기준 경로 → 브라우저 URL */
export const dataUrl = (rel: string) => DATA_ROOT + rel;
/** 프로젝트 폴더 기준 경로(png/card-01.png) → 브라우저 URL */
export const projectFileUrl = (id: string, rel: string) => dataUrl(`projects/${encodeURIComponent(id)}/${rel}`);

export class DataError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

// 같은 파일은 한 번만 받는다 (탭을 오가도 다시 요청하지 않음)
const cache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(rel: string): Promise<T> {
  const res = await fetch(dataUrl(rel));
  if (!res.ok) throw new DataError(`${rel}을(를) 불러오지 못했어요 (HTTP ${res.status})`, res.status);
  // 정적 호스팅은 없는 파일에 index.html을 돌려주기도 해서, JSON이 아니면 없는 파일로 본다
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new DataError(`${rel}을(를) 찾을 수 없어요`, 404);
  return (await res.json()) as T;
}

export function loadJson<T>(rel: string): Promise<T> {
  let p = cache.get(rel) as Promise<T> | undefined;
  if (!p) {
    p = fetchJson<T>(rel);
    cache.set(rel, p);
    p.catch(() => cache.delete(rel)); // 실패는 다시 시도할 수 있게
  }
  return p;
}

export const loadIndex = () => loadJson<WebIndex>('index.json');
export const loadProject = (id: string) => loadJson<Project>(`projects/${encodeURIComponent(id)}/project.json`);
export const loadTimeline = (id: string) => loadJson<Timeline>(`projects/${encodeURIComponent(id)}/timeline.json`);

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: DataError | Error }
  | { status: 'ready'; data: T };

/** 비동기 불러오기를 화면 상태로 바꾼다. key가 바뀌면 다시 불러옴 */
export function useLoad<T>(load: () => Promise<T>, key: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (error: Error) => alive && setState({ status: 'error', error }),
    );
    return () => {
      alive = false;
    };
    // load는 key로 대표되므로 key가 바뀔 때만 다시 불러옴
  }, [key]);
  return state;
}

export const useIndex = () => useLoad(loadIndex, 'index');
export const useProject = (id: string) => useLoad(() => loadProject(id), `project:${id}`);
export const useTimeline = (id: string) => useLoad(() => loadTimeline(id), `timeline:${id}`);
