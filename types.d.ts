declare module "*.json" {
  const value: any;
  export default value;
}

interface RestaurantDocument {
  id: string;
  text: string;
}
