export type PublicPolicies = {
  cancellation: string;
  minors: string;
  pets: string;
  smoking: string;
  quietHours: string;
};

export type PublicSiteContent = {
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  province: string;
  basePriceArs: number;
  checkInFrom: string;
  checkInUntil: string;
  checkOutUntil: string;
  quietHoursFrom: string;
  quietHoursUntil: string;
  policies: PublicPolicies;
};
