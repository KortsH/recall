import React, { useEffect, useMemo, useRef, useState } from "react";
import { tr, useLanguage } from "./i18n.ts";
import {
  MAX_IMAGE_BYTES,
  validateImageSource,
  type QuizImage,
} from "../core/media.ts";
import { RichText } from "./rich-text.tsx";

export function ImageFigure({ image }: { image?: QuizImage }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const valid = useMemo(
    () => !!image && validateImageSource(image.src),
    [image?.src],
  );
  useEffect(() => {
    setOpen(false);
  }, [image?.src]);
  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  if (!image) return null;
  if (!valid) return <p role="alert">{tr("media.invalid")}</p>;
  const leave = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <figure className="quiz-image">
      <button
        type="button"
        className="quiz-image-open"
        ref={trigger}
        onClick={() => setOpen(true)}
        aria-label={tr("media.expand", { alt: image.alt })}
      >
        <img src={image.src} alt={image.alt} decoding="async" />
      </button>
      {image.caption && (
        <figcaption>
          <RichText text={image.caption} />
        </figcaption>
      )}
      <small className="image-enlarge-hint">{tr("media.enlargeHint")}</small>
      {open && (
        <div
          className="image-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) leave();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              leave();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              close.current?.focus();
            }
          }}
        >
          <section
            className="image-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={image.alt}
          >
            <button
              type="button"
              className="button secondary"
              ref={close}
              onClick={leave}
            >
              {tr("media.close")}
            </button>
            <img src={image.src} alt={image.alt} />
            {image.caption && (
              <p>
                <RichText text={image.caption} />
              </p>
            )}
          </section>
        </div>
      )}
    </figure>
  );
}

async function compressedImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * MAX_IMAGE_BYTES
  )
    throw new Error(tr("media.chooseRaster"));
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(tr("media.invalid")));
    reader.readAsDataURL(file);
  });
  if (!validateImageSource(source, 10 * MAX_IMAGE_BYTES))
    throw new Error(tr("media.invalid"));
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(tr("media.invalid")));
    image.src = source;
  });
  let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  for (let n = 0; n < 6; n++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL(file.type, 0.88);
    if (validateImageSource(result)) return result;
    scale *= 0.75;
  }
  throw new Error(tr("media.tooLarge"));
}
export function ImageEditor({
  label,
  value,
  onChange,
  onBusy,
}: {
  label: string;
  value?: QuizImage;
  onChange: (image: QuizImage | undefined) => void;
  onBusy?: (loading: boolean) => void;
}) {
  useLanguage();
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <fieldset className="image-editor" disabled={loading}>
      <legend>{label}</legend>
      <label className="field">
        {tr("media.upload")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={loading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const token = ++generation.current;
            setLoading(true);
            setError("");
            onBusy?.(true);
            try {
              const src = await compressedImage(file);
              if (token === generation.current) onChange({ src, alt: "" });
            } catch (error) {
              if (token === generation.current)
                setError((error as Error).message);
            } finally {
              if (token === generation.current) setLoading(false);
              onBusy?.(false);
            }
          }}
        />
      </label>
      <small>{loading ? tr("media.preparing") : tr("media.portable")}</small>
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <label className="field">
            {tr("media.alt")}
            <input
              value={value.alt}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
          </label>
          <label className="field">
            {tr("media.caption")}
            <input
              value={value.caption ?? ""}
              onChange={(e) =>
                onChange({ ...value, caption: e.target.value || undefined })
              }
            />
          </label>
          <ImageFigure image={value} />
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(undefined)}
          >
            {tr("media.remove")}
          </button>
        </>
      )}
    </fieldset>
  );
}
