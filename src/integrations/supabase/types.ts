export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          credit_kind: Database["public"]["Enums"]["credit_kind"] | null
          credits_charged: number
          error_message: string | null
          garment_id: string | null
          id: string
          idempotency_key: string
          input: Json
          kind: Database["public"]["Enums"]["ai_job_kind"]
          outfit_id: string | null
          owner_id: string
          progress: number
          result: Json | null
          stage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ai_job_status"]
          updated_at: string
          wishlist_item_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null
          credits_charged?: number
          error_message?: string | null
          garment_id?: string | null
          id?: string
          idempotency_key: string
          input?: Json
          kind: Database["public"]["Enums"]["ai_job_kind"]
          outfit_id?: string | null
          owner_id: string
          progress?: number
          result?: Json | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          updated_at?: string
          wishlist_item_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null
          credits_charged?: number
          error_message?: string | null
          garment_id?: string | null
          id?: string
          idempotency_key?: string
          input?: Json
          kind?: Database["public"]["Enums"]["ai_job_kind"]
          outfit_id?: string | null
          owner_id?: string
          progress?: number
          result?: Json | null
          stage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          updated_at?: string
          wishlist_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_garment_id_fkey"
            columns: ["garment_id"]
            isOneToOne: false
            referencedRelation: "garments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_outfit_id_fkey"
            columns: ["outfit_id"]
            isOneToOne: false
            referencedRelation: "outfits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_wishlist_item_id_fkey"
            columns: ["wishlist_item_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string | null
          props: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          props?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          props?: Json
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          id: string
          owner_id: string | null
          payload: Json
          processed_at: string | null
          stripe_event_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string | null
          payload?: Json
          processed_at?: string | null
          stripe_event_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string | null
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          garment_allowance: number
          import_allowance: number
          import_balance: number
          on_model_allowance: number
          on_model_balance: number
          owner_id: string
          period_end: string
          period_start: string
          updated_at: string
        }
        Insert: {
          garment_allowance?: number
          import_allowance?: number
          import_balance?: number
          on_model_allowance?: number
          on_model_balance?: number
          owner_id: string
          period_end?: string
          period_start?: string
          updated_at?: string
        }
        Update: {
          garment_allowance?: number
          import_allowance?: number
          import_balance?: number
          on_model_allowance?: number
          on_model_balance?: number
          owner_id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          ai_job_id: string | null
          created_at: string
          delta: number
          id: string
          kind: Database["public"]["Enums"]["credit_kind"]
          owner_id: string
          reason: string
        }
        Insert: {
          ai_job_id?: string | null
          created_at?: string
          delta: number
          id?: string
          kind: Database["public"]["Enums"]["credit_kind"]
          owner_id: string
          reason: string
        }
        Update: {
          ai_job_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          kind?: Database["public"]["Enums"]["credit_kind"]
          owner_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_ai_job_id_fkey"
            columns: ["ai_job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      garment_images: {
        Row: {
          bucket: string
          byte_size: number | null
          created_at: string
          garment_id: string | null
          height: number | null
          id: string
          is_current: boolean
          kind: Database["public"]["Enums"]["image_kind"]
          owner_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          bucket?: string
          byte_size?: number | null
          created_at?: string
          garment_id?: string | null
          height?: number | null
          id?: string
          is_current?: boolean
          kind: Database["public"]["Enums"]["image_kind"]
          owner_id: string
          storage_path: string
          width?: number | null
        }
        Update: {
          bucket?: string
          byte_size?: number | null
          created_at?: string
          garment_id?: string | null
          height?: number | null
          id?: string
          is_current?: boolean
          kind?: Database["public"]["Enums"]["image_kind"]
          owner_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "garment_images_garment_id_fkey"
            columns: ["garment_id"]
            isOneToOne: false
            referencedRelation: "garments"
            referencedColumns: ["id"]
          },
        ]
      }
      garments: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          legacy_id: string | null
          name: string
          occasion: string | null
          owner_id: string
          palette: Json
          part: string
          secondary_color: string | null
          source: string
          tags: string[]
          updated_at: string
          value_amount: number | null
          wardrobe_id: string
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          occasion?: string | null
          owner_id: string
          palette?: Json
          part?: string
          secondary_color?: string | null
          source?: string
          tags?: string[]
          updated_at?: string
          value_amount?: number | null
          wardrobe_id: string
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          occasion?: string | null
          owner_id?: string
          palette?: Json
          part?: string
          secondary_color?: string | null
          source?: string
          tags?: string[]
          updated_at?: string
          value_amount?: number | null
          wardrobe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "garments_wardrobe_id_fkey"
            columns: ["wardrobe_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["id"]
          },
        ]
      }
      model_profiles: {
        Row: {
          bucket: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          owner_id: string
          storage_path: string
        }
        Insert: {
          bucket?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          owner_id: string
          storage_path: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          owner_id?: string
          storage_path?: string
        }
        Relationships: []
      }
      outfit_garments: {
        Row: {
          garment_id: string
          outfit_id: string
          owner_id: string
          position: number
        }
        Insert: {
          garment_id: string
          outfit_id: string
          owner_id: string
          position?: number
        }
        Update: {
          garment_id?: string
          outfit_id?: string
          owner_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "outfit_garments_garment_id_fkey"
            columns: ["garment_id"]
            isOneToOne: false
            referencedRelation: "garments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outfit_garments_outfit_id_fkey"
            columns: ["outfit_id"]
            isOneToOne: false
            referencedRelation: "outfits"
            referencedColumns: ["id"]
          },
        ]
      }
      outfits: {
        Row: {
          colors: Json
          created_at: string
          id: string
          legacy_id: string | null
          modeled_image_id: string | null
          name: string
          owner_id: string
          updated_at: string
          wardrobe_id: string
        }
        Insert: {
          colors?: Json
          created_at?: string
          id?: string
          legacy_id?: string | null
          modeled_image_id?: string | null
          name?: string
          owner_id: string
          updated_at?: string
          wardrobe_id: string
        }
        Update: {
          colors?: Json
          created_at?: string
          id?: string
          legacy_id?: string | null
          modeled_image_id?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
          wardrobe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outfits_modeled_image_id_fkey"
            columns: ["modeled_image_id"]
            isOneToOne: false
            referencedRelation: "garment_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outfits_wardrobe_id_fkey"
            columns: ["wardrobe_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_consent_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_founder: boolean
          marketing_opt_in: boolean
          onboarding_completed_at: string | null
          onboarding_step: string
          updated_at: string
        }
        Insert: {
          ai_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_founder?: boolean
          marketing_opt_in?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string
          updated_at?: string
        }
        Update: {
          ai_consent_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_founder?: boolean
          marketing_opt_in?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          owner_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          owner_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          owner_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wardrobes: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          is_primary: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          is_primary?: boolean
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          is_primary?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          added_at: string
          brand: string | null
          color: string | null
          id: string
          image_id: string | null
          legacy_id: string | null
          modeled_image_id: string | null
          name: string | null
          note: string | null
          owner_id: string
          part: string | null
          price: string | null
          status: Database["public"]["Enums"]["wishlist_status"]
          tags: string[]
          updated_at: string
          url: string | null
          wardrobe_id: string | null
        }
        Insert: {
          added_at?: string
          brand?: string | null
          color?: string | null
          id?: string
          image_id?: string | null
          legacy_id?: string | null
          modeled_image_id?: string | null
          name?: string | null
          note?: string | null
          owner_id: string
          part?: string | null
          price?: string | null
          status?: Database["public"]["Enums"]["wishlist_status"]
          tags?: string[]
          updated_at?: string
          url?: string | null
          wardrobe_id?: string | null
        }
        Update: {
          added_at?: string
          brand?: string | null
          color?: string | null
          id?: string
          image_id?: string | null
          legacy_id?: string | null
          modeled_image_id?: string | null
          name?: string | null
          note?: string | null
          owner_id?: string
          part?: string | null
          price?: string | null
          status?: Database["public"]["Enums"]["wishlist_status"]
          tags?: string[]
          updated_at?: string
          url?: string | null
          wardrobe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "garment_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_modeled_image_id_fkey"
            columns: ["modeled_image_id"]
            isOneToOne: false
            referencedRelation: "garment_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_wardrobe_id_fkey"
            columns: ["wardrobe_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ai_job_kind:
        | "import_analyze"
        | "cutout"
        | "on_model"
        | "wishlist_resolve"
        | "outfit_on_model"
      ai_job_status:
        | "queued"
        | "processing"
        | "complete"
        | "failed"
        | "canceled"
      app_role: "admin" | "founder" | "member"
      credit_kind: "import" | "on_model"
      image_kind: "original" | "cutout" | "thumbnail" | "modeled" | "reference"
      wishlist_status: "pending" | "processing" | "ready" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_job_kind: [
        "import_analyze",
        "cutout",
        "on_model",
        "wishlist_resolve",
        "outfit_on_model",
      ],
      ai_job_status: ["queued", "processing", "complete", "failed", "canceled"],
      app_role: ["admin", "founder", "member"],
      credit_kind: ["import", "on_model"],
      image_kind: ["original", "cutout", "thumbnail", "modeled", "reference"],
      wishlist_status: ["pending", "processing", "ready", "failed"],
    },
  },
} as const
