import { faqs } from "@/app/lib/site";

export function FaqList({ limit }: { limit?: number }) {
  return (
    <div className="faq-list">
      {faqs.slice(0, limit).map((item, index) => (
        <details key={item.question} name="hostel-faq">
          <summary>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.question}
            <i aria-hidden="true">+</i>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
