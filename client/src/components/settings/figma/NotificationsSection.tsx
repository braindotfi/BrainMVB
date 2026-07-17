import { useUserContact } from "@/lib/userContact";

export default function NotificationsSection() {
  const { email, phone } = useUserContact();
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[8px] items-start p-[16px] relative rounded-[16px] shrink-0 w-full">
        <p className="font-['Gilroy',sans-serif] font-semibold leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] w-full">
          Notification preferences are not yet available.
        </p>
        <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#6c779d] text-[14px] w-full">
          Once notification channels are wired up, Brain will reach you at {email} (email) and {phone} (SMS).
        </p>
      </div>
    </div>
  );
}
