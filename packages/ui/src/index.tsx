import type { PropsWithChildren } from 'react';

export function Panel({ children }: PropsWithChildren) {
  return children as JSX.Element;
}
