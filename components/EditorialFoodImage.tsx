import Image from "next/image";

type EditorialFoodImageProps = {
  alt: string;
  caption: string;
  priority?: boolean;
  src: string;
};

export function EditorialFoodImage({
  alt,
  caption,
  priority = false,
  src,
}: EditorialFoodImageProps) {
  return (
    <figure className="group relative min-h-[360px] overflow-hidden rounded-[1.25rem] bg-oat shadow-[0_24px_70px_-38px_rgba(17,17,17,0.55)] sm:min-h-[460px] md:min-h-[580px]">
      <Image
        alt={alt}
        className="object-cover transition duration-700 ease-out group-hover:scale-[1.02]"
        fill
        priority={priority}
        sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1280px) 50vw, 590px"
        src={src}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent px-5 pb-5 pt-20 sm:px-7 sm:pb-7">
        <figcaption className="text-xs font-medium uppercase tracking-[0.24em] text-white/90">
          {caption}
        </figcaption>
      </div>
    </figure>
  );
}
