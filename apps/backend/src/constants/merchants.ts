export interface MerchantSeed {
  name: string;
  categoryPrimary: string;
  categoryDetailed: string;
  paymentChannel: "online" | "in store" | "other";
  amountRange: [number, number]; // positive = debit (money out); negatives applied on return
  frequency: number; // relative weight
}

export const MERCHANTS: MerchantSeed[] = [
  { name: "Whole Foods Market", categoryPrimary: "Food and Drink", categoryDetailed: "Groceries", paymentChannel: "in store", amountRange: [18, 140], frequency: 6 },
  { name: "Trader Joe's", categoryPrimary: "Food and Drink", categoryDetailed: "Groceries", paymentChannel: "in store", amountRange: [15, 90], frequency: 5 },
  { name: "Amazon", categoryPrimary: "Shopping", categoryDetailed: "Online Marketplaces", paymentChannel: "online", amountRange: [8, 220], frequency: 9 },
  { name: "Netflix", categoryPrimary: "Entertainment", categoryDetailed: "Streaming", paymentChannel: "online", amountRange: [15.49, 15.49], frequency: 1 },
  { name: "Spotify", categoryPrimary: "Entertainment", categoryDetailed: "Music", paymentChannel: "online", amountRange: [10.99, 10.99], frequency: 1 },
  { name: "Shell", categoryPrimary: "Travel", categoryDetailed: "Gas Stations", paymentChannel: "in store", amountRange: [25, 75], frequency: 4 },
  { name: "Chevron", categoryPrimary: "Travel", categoryDetailed: "Gas Stations", paymentChannel: "in store", amountRange: [25, 75], frequency: 3 },
  { name: "Starbucks", categoryPrimary: "Food and Drink", categoryDetailed: "Coffee Shop", paymentChannel: "in store", amountRange: [4, 14], frequency: 8 },
  { name: "Delta Airlines", categoryPrimary: "Travel", categoryDetailed: "Airlines and Aviation", paymentChannel: "online", amountRange: [180, 820], frequency: 1 },
  { name: "United Airlines", categoryPrimary: "Travel", categoryDetailed: "Airlines and Aviation", paymentChannel: "online", amountRange: [200, 900], frequency: 1 },
  { name: "Uber", categoryPrimary: "Travel", categoryDetailed: "Ride Share", paymentChannel: "online", amountRange: [8, 60], frequency: 5 },
  { name: "Lyft", categoryPrimary: "Travel", categoryDetailed: "Ride Share", paymentChannel: "online", amountRange: [7, 55], frequency: 3 },
  { name: "Venmo Transfer", categoryPrimary: "Transfer", categoryDetailed: "Internal", paymentChannel: "online", amountRange: [10, 200], frequency: 4 },
  { name: "Payroll Deposit", categoryPrimary: "Transfer", categoryDetailed: "Payroll", paymentChannel: "other", amountRange: [-3600, -2200], frequency: 2 },
  { name: "Pacific Gas and Electric", categoryPrimary: "Service", categoryDetailed: "Utilities", paymentChannel: "online", amountRange: [60, 180], frequency: 1 },
  { name: "Comcast Xfinity", categoryPrimary: "Service", categoryDetailed: "Utilities", paymentChannel: "online", amountRange: [75, 110], frequency: 1 },
  { name: "CVS Pharmacy", categoryPrimary: "Healthcare", categoryDetailed: "Pharmacy", paymentChannel: "in store", amountRange: [12, 90], frequency: 2 },
  { name: "Target", categoryPrimary: "Shopping", categoryDetailed: "General", paymentChannel: "in store", amountRange: [15, 260], frequency: 5 },
  { name: "Apple Store", categoryPrimary: "Shopping", categoryDetailed: "General", paymentChannel: "online", amountRange: [0.99, 1200], frequency: 2 },
  { name: "Chipotle", categoryPrimary: "Food and Drink", categoryDetailed: "Restaurants", paymentChannel: "in store", amountRange: [11, 32], frequency: 6 },
  { name: "DoorDash", categoryPrimary: "Food and Drink", categoryDetailed: "Restaurants", paymentChannel: "online", amountRange: [18, 60], frequency: 4 },
];

export const CITIES: { city: string; region: string; lat: number; lon: number }[] = [
  { city: "San Francisco", region: "CA", lat: 37.7749, lon: -122.4194 },
  { city: "Oakland", region: "CA", lat: 37.8044, lon: -122.2712 },
  { city: "New York", region: "NY", lat: 40.7128, lon: -74.006 },
  { city: "Austin", region: "TX", lat: 30.2672, lon: -97.7431 },
  { city: "Seattle", region: "WA", lat: 47.6062, lon: -122.3321 },
  { city: "Chicago", region: "IL", lat: 41.8781, lon: -87.6298 },
];
