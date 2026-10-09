export type TodaySession = {
  id: string;
  startsAt: string;
  time: string;
  endTime: string;
  date: string;
  language: string;
  status: "open" | "closed" | "cancelled";
  capacity: number;
  booked: number;
  minPax: number;
  past: boolean;
  product: { name: string; color: string };
};

export type ActivityItem = {
  id: string;
  at: string;
  text: string;
  customerName: string;
  productName: string;
  pax: number;
  totalCents: number;
  channel: string;
  cancelled: boolean;
};
