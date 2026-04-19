export interface InstitutionSeed {
  id: string;
  name: string;
  primaryColor: string;
  supportedProducts: string[];
  routingNumbers: string[];
}

const BASE = ["transactions", "auth", "balance", "identity"];
const WITH_INVEST = [...BASE, "investments"];
const WITH_INCOME = [...BASE, "income"];
const ALL = [...BASE, "investments", "income"];

export const INSTITUTIONS: InstitutionSeed[] = [
  { id: "ins_1", name: "Chase", primaryColor: "#117ACA", supportedProducts: ALL, routingNumbers: ["021000021"] },
  { id: "ins_2", name: "Bank of America", primaryColor: "#E31837", supportedProducts: ALL, routingNumbers: ["026009593"] },
  { id: "ins_3", name: "Wells Fargo", primaryColor: "#D71E28", supportedProducts: ALL, routingNumbers: ["121000248"] },
  { id: "ins_4", name: "Citibank", primaryColor: "#003B70", supportedProducts: ALL, routingNumbers: ["021000089"] },
  { id: "ins_5", name: "US Bank", primaryColor: "#1D4FA0", supportedProducts: ALL, routingNumbers: ["091000022"] },
  { id: "ins_6", name: "Capital One", primaryColor: "#D03027", supportedProducts: WITH_INCOME, routingNumbers: ["031176110"] },
  { id: "ins_7", name: "TD Bank", primaryColor: "#2E8B57", supportedProducts: BASE, routingNumbers: ["031101266"] },
  { id: "ins_8", name: "PNC Bank", primaryColor: "#F58025", supportedProducts: WITH_INCOME, routingNumbers: ["043000096"] },
  { id: "ins_9", name: "Charles Schwab", primaryColor: "#00A0DF", supportedProducts: WITH_INVEST, routingNumbers: ["121202211"] },
  { id: "ins_10", name: "Fidelity", primaryColor: "#47A700", supportedProducts: WITH_INVEST, routingNumbers: ["101205681"] },
  { id: "ins_11", name: "Vanguard", primaryColor: "#96151D", supportedProducts: WITH_INVEST, routingNumbers: [] },
  { id: "ins_12", name: "Robinhood", primaryColor: "#00C805", supportedProducts: ["investments", "balance", "identity"], routingNumbers: [] },
  { id: "ins_13", name: "E*TRADE", primaryColor: "#6633CC", supportedProducts: WITH_INVEST, routingNumbers: [] },
  { id: "ins_14", name: "Ally Bank", primaryColor: "#6633A1", supportedProducts: ALL, routingNumbers: ["124003116"] },
  { id: "ins_15", name: "Navy Federal Credit Union", primaryColor: "#002D62", supportedProducts: BASE, routingNumbers: ["256074974"] },
  { id: "ins_16", name: "USAA", primaryColor: "#003366", supportedProducts: ALL, routingNumbers: ["314074269"] },
  { id: "ins_17", name: "Golden 1 Credit Union", primaryColor: "#C8A951", supportedProducts: BASE, routingNumbers: ["321175261"] },
  { id: "ins_18", name: "Teachers Federal Credit Union", primaryColor: "#00548A", supportedProducts: BASE, routingNumbers: ["221475786"] },
  { id: "ins_19", name: "Alliant Credit Union", primaryColor: "#0075C9", supportedProducts: WITH_INCOME, routingNumbers: ["271081528"] },
  { id: "ins_20", name: "Pentagon Federal Credit Union", primaryColor: "#003087", supportedProducts: ALL, routingNumbers: ["256078446"] },
];
