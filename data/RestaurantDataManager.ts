import { Document } from "langchain/document";
import restaurantData from "./restaurant_docs_detailed.json";

export interface RestaurantDocument {
  id: string;
  text: string;
}

export interface RestaurantReservation {
  name: string;
  date: string;
  time: string;
  partySize: number;
  contactInfo: string;
  specialRequests?: string;
}

export class RestaurantDataManager {
  private static instance: RestaurantDataManager;
  private reservations: RestaurantReservation[] = [];

  private constructor() {}

  public static getInstance(): RestaurantDataManager {
    if (!RestaurantDataManager.instance) {
      RestaurantDataManager.instance = new RestaurantDataManager();
    }
    return RestaurantDataManager.instance;
  }

  /**
   * Get all restaurant data as LangChain documents
   */
  public getLangChainDocuments(): Document[] {
    return restaurantData.map(
      (item: RestaurantDocument) =>
        new Document({
          pageContent: item.text,
          metadata: { id: item.id },
        })
    );
  }

  /**
   * Get restaurant data as raw objects
   */
  public getRawData(): RestaurantDocument[] {
    return restaurantData;
  }

  /**
   * Get restaurant information by category
   */
  public getDataByCategory(category: string): RestaurantDocument[] {
    return restaurantData.filter((doc: RestaurantDocument) =>
      doc.id.startsWith(category)
    );
  }

  /**
   * Get all menu items
   */
  public getMenuItems(): RestaurantDocument[] {
    return this.getDataByCategory("menu_");
  }

  /**
   * Get restaurant info (hours, location, etc.)
   */
  public getRestaurantInfo(): RestaurantDocument | undefined {
    return restaurantData.find(
      (doc: RestaurantDocument) => doc.id === "restaurant_info"
    );
  }

  /**
   * Add a reservation (for future CRM integration)
   */
  public addReservation(reservation: RestaurantReservation): boolean {
    try {
      // Add validation logic here
      this.reservations.push(reservation);
      return true;
    } catch (error) {
      console.error("Error adding reservation:", error);
      return false;
    }
  }

  /**
   * Get all reservations (for future CRM integration)
   */
  public getReservations(): RestaurantReservation[] {
    return this.reservations;
  }
}

export default RestaurantDataManager;
