export type PublicPolicies = {
  cancellation: string;
  minors: string;
  pets: string;
  smoking: string;
  quietHours: string;
  residentPetsDisclosure: string;
};

export type PublicSiteContent = {
  name: string;
  descriptor: string;
  country: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  province: string;
  checkInFrom: string;
  checkInUntil: string;
  checkOutUntil: string;
  courtesyCheckoutUntil: string;
  courtesyRequiresApproval: true;
  breakfastFrom: string;
  breakfastUntil: string;
  quietHoursFrom: string;
  quietHoursUntil: string;
  policies: PublicPolicies;
};
