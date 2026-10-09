
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "booking_events": {
                  Row: {
                    "actor": string,"booking_id": string,"created_at": string,"id": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor": string,"booking_id": string,"created_at"?: string,"id"?: string,"text": string
                  }
                  Update: {
                    "actor"?: string,"booking_id"?: string,"created_at"?: string,"id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_lines": {
                  Row: {
                    "booking_id": string,"created_at": string,"qty": number,"takes_seat": boolean,"ticket_type_id": string,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"created_at"?: string,"qty": number,"takes_seat": boolean,"ticket_type_id": string,"unit_price_cents": number
                  }
                  Update: {
                    "booking_id"?: string,"created_at"?: string,"qty"?: number,"takes_seat"?: boolean,"ticket_type_id"?: string,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_lines_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_lines_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "agent": string,"channel": string,"checked_in": boolean,"code": string,"created_at": string,"customer_id": string,"hold_expires_at": string | null,"hotel": string,"id": string,"notes": string,"paid_cents": number,"payment_method": string | null,"payment_status": string,"session_id": string,"status": string,"stripe_checkout_id": string | null,"stripe_payment_intent": string | null,"total_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "agent"?: string,"channel": string,"checked_in"?: boolean,"code": string,"created_at"?: string,"customer_id": string,"hold_expires_at"?: string | null,"hotel"?: string,"id"?: string,"notes"?: string,"paid_cents"?: number,"payment_method"?: string | null,"payment_status"?: string,"session_id": string,"status"?: string,"stripe_checkout_id"?: string | null,"stripe_payment_intent"?: string | null,"total_cents": number
                  }
                  Update: {
                    "agent"?: string,"channel"?: string,"checked_in"?: boolean,"code"?: string,"created_at"?: string,"customer_id"?: string,"hold_expires_at"?: string | null,"hotel"?: string,"id"?: string,"notes"?: string,"paid_cents"?: number,"payment_method"?: string | null,"payment_status"?: string,"session_id"?: string,"status"?: string,"stripe_checkout_id"?: string | null,"stripe_payment_intent"?: string | null,"total_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"name": string,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"phone"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"phone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"product_prices": {
                  Row: {
                    "created_at": string,"price_cents": number,"product_id": string,"ticket_type_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"price_cents": number,"product_id": string,"ticket_type_id": string
                  }
                  Update: {
                    "created_at"?: string,"price_cents"?: number,"product_id"?: string,"ticket_type_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_prices_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_prices_ticket_type_id_fkey"
      columns: ["ticket_type_id"]
isOneToOne: false
      referencedRelation: "ticket_types"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"capacity": number,"color": string,"created_at": string,"description": string,"duration_min": number,"id": string,"meeting_point": string,"min_pax": number,"name": string,"photo_path": string | null,"pickup": boolean,"place": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"capacity": number,"color"?: string,"created_at"?: string,"description"?: string,"duration_min": number,"id"?: string,"meeting_point"?: string,"min_pax"?: number,"name": string,"photo_path"?: string | null,"pickup"?: boolean,"place"?: string,"slug": string
                  }
                  Update: {
                    "active"?: boolean,"capacity"?: number,"color"?: string,"created_at"?: string,"description"?: string,"duration_min"?: number,"id"?: string,"meeting_point"?: string,"min_pax"?: number,"name"?: string,"photo_path"?: string | null,"pickup"?: boolean,"place"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"schedule_rules": {
                  Row: {
                    "created_at": string,"id": string,"language": string,"product_id": string,"times": (string)[],"valid_from": string | null,"valid_to": string | null,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"language": string,"product_id": string,"times": (string)[],"valid_from"?: string | null,"valid_to"?: string | null,"weekdays": (number)[]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"language"?: string,"product_id"?: string,"times"?: (string)[],"valid_from"?: string | null,"valid_to"?: string | null,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_rules_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "capacity": number,"capacity_custom": boolean,"created_at": string,"ends_at": string,"id": string,"language": string,"product_id": string,"starts_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"capacity_custom"?: boolean,"created_at"?: string,"ends_at": string,"id"?: string,"language": string,"product_id": string,"starts_at": string,"status"?: string
                  }
                  Update: {
                    "capacity"?: number,"capacity_custom"?: boolean,"created_at"?: string,"ends_at"?: string,"id"?: string,"language"?: string,"product_id"?: string,"starts_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "business_name": string,"cancel_hours": number,"created_at": string,"currency": string,"cutoff_hours": number,"default_capacity": number,"email": string,"id": number,"languages": (string)[],"phone": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_name"?: string,"cancel_hours"?: number,"created_at"?: string,"currency"?: string,"cutoff_hours"?: number,"default_capacity"?: number,"email"?: string,"id"?: number,"languages"?: (string)[],"phone"?: string,"timezone"?: string
                  }
                  Update: {
                    "business_name"?: string,"cancel_hours"?: number,"created_at"?: string,"currency"?: string,"cutoff_hours"?: number,"default_capacity"?: number,"email"?: string,"id"?: number,"languages"?: (string)[],"phone"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "created_at": string,"name": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"name": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"name"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ticket_types": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"note": string,"sort": number,"takes_seat": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"note"?: string,"sort"?: number,"takes_seat"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"note"?: string,"sort"?: number,"takes_seat"?: boolean
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "session_availability": {
                  Row: {
                    "booked_seats": number | null,"capacity": number | null,"free_seats": number | null,"pax": number | null,"product_id": string | null,"session_id": string | null,"starts_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "sessions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "create_booking_hold":
{ Args: { "p_booking"?: Json,"p_customer": Json,"p_hold_minutes"?: number,"p_lines": Json,"p_session_id": string }; Returns: Json
                           },
"generate_sessions":
{ Args: { "p_from": string,"p_product_id"?: string,"p_to": string }; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"save_product":
{ Args: { "p_id"?: string,"p_prices": Json,"p_product": Json,"p_rules": Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
