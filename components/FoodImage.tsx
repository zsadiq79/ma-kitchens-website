import Image from "next/image";

type FoodImageProps = {
  alt: string;
  caption: string;
  src: string;
};

export function FoodImage({ alt, caption, src }: FoodImageProps) {
  return (
    <figure className="group relative min-h-[360px] overflow-hidden rounded-[1.5rem] bg-oat sm:min-h-[440px] lg:min-h-[560px]">
      <Image
        alt={alt}
        className="object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
        fill
        sizes="(min-width: 768px) 50vw, 100vw"
        src={src}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-white/5" />
      <figcaption className="absolute bottom-0 left-0 max-w-sm p-6 font-serif text-2xl leading-tight text-white sm:p-8 sm:text-3xl">
        {caption}
      </figcaption>
    </figure>
  );
}
