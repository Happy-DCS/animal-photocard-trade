export default function SectionTitle({ title, description }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-gray-400 pb-3">
      <h3 className="font-sans-700 text-xl text-white tablet:text-2xl">{title}</h3>
      {description && <p className="font-sans-400 text-sm text-gray-300">{description}</p>}
    </div>
  );
}
