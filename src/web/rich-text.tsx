import React, { useMemo } from "react";
import katex from "katex";

export function mathSegments(text: string) {
  const result: { text: string; math?: boolean; display?: boolean }[] = [];
  const pattern =
    /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|(?<!\\)\$(?![\s$])([^\n$]*?[^\s$])\$(?!\d)/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > end) result.push({ text: text.slice(end, match.index) });
    const body = match[1] ?? match[2] ?? match[3] ?? match[4];
    result.push(
      body.length <= 4096
        ? {
            text: body,
            math: true,
            display: match[1] !== undefined || match[3] !== undefined,
          }
        : { text: match[0] },
    );
    end = match.index! + match[0].length;
  }
  if (end < text.length) result.push({ text: text.slice(end) });
  return result;
}
export function RichText({ text }: { text: string }) {
  const pieces = useMemo(
    () =>
      mathSegments(text).map((piece) => {
        if (!piece.math) return piece;
        try {
          return {
            ...piece,
            html: katex.renderToString(piece.text, {
              displayMode: !!piece.display,
              throwOnError: true,
              trust: false,
              strict: "error",
              maxExpand: 1000,
              maxSize: 20,
              output: "htmlAndMathml",
              macros: {},
            }),
          };
        } catch {
          return { ...piece, math: false };
        }
      }),
    [text],
  );
  return (
    <>
      {pieces.map((piece, n) =>
        "html" in piece ? (
          <span
            key={n}
            className={piece.display ? "math-display" : "math-inline"}
            dangerouslySetInnerHTML={{ __html: piece.html! }}
          />
        ) : (
          <React.Fragment key={n}>{piece.text}</React.Fragment>
        ),
      )}
    </>
  );
}
