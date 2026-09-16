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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author_id: string | null
          body: string
          cover_photo_r2_key: string | null
          created_at: string
          id: string
          published_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          cover_photo_r2_key?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          cover_photo_r2_key?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_item_checks: {
        Row: {
          board_id: string
          board_item_id: string
          checked_at: string
          user_id: string
        }
        Insert: {
          board_id: string
          board_item_id: string
          checked_at?: string
          user_id: string
        }
        Update: {
          board_id?: string
          board_item_id?: string
          checked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_item_checks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_item_checks_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_item_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_items: {
        Row: {
          added_at: string
          board_id: string
          id: string
          item_type: string
          note: string | null
          photo_id: string | null
          place_id: string | null
          position: number
          visit_id: string | null
        }
        Insert: {
          added_at?: string
          board_id: string
          id?: string
          item_type: string
          note?: string | null
          photo_id?: string | null
          place_id?: string | null
          position?: number
          visit_id?: string | null
        }
        Update: {
          added_at?: string
          board_id?: string
          id?: string
          item_type?: string
          note?: string | null
          photo_id?: string | null
          place_id?: string | null
          position?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          cover_photo_id: string | null
          cover_photo_r2_key: string | null
          cover_r2_key: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          is_private: boolean
          list_style: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          is_private?: boolean
          list_style?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          is_private?: boolean
          list_style?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          user_id: string
          visit_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          user_id: string
          visit_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      country_continents: {
        Row: {
          continent_name: string
          country_name: string
        }
        Insert: {
          continent_name: string
          country_name: string
        }
        Update: {
          continent_name?: string
          country_name?: string
        }
        Relationships: []
      }
      draft_visits: {
        Row: {
          created_at: string
          id: string
          note: string | null
          place_id: string | null
          rating: number | null
          updated_at: string
          user_id: string
          visited_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string | null
          rating?: number | null
          updated_at?: string
          user_id: string
          visited_on: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string | null
          rating?: number | null
          updated_at?: string
          user_id?: string
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          status: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          status?: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      harmony_refresh_queue: {
        Row: {
          queued_at: string
          user_id: string
        }
        Insert: {
          queued_at?: string
          user_id: string
        }
        Update: {
          queued_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harmony_refresh_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      harmony_scores: {
        Row: {
          computed_at: string
          evidence: number
          score: number
          shared_areas: number
          shared_destinations: number
          shared_local: number
          shared_places: number
          user_a: string
          user_b: string
        }
        Insert: {
          computed_at?: string
          evidence?: number
          score: number
          shared_areas?: number
          shared_destinations?: number
          shared_local?: number
          shared_places?: number
          user_a: string
          user_b: string
        }
        Update: {
          computed_at?: string
          evidence?: number
          score?: number
          shared_areas?: number
          shared_destinations?: number
          shared_local?: number
          shared_places?: number
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "harmony_scores_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harmony_scores_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      home_locations: {
        Row: {
          created_at: string
          id: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_locations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_clicks: {
        Row: {
          clicked_at: string
          code: string
          id: string
          platform: string | null
        }
        Insert: {
          clicked_at?: string
          code: string
          id?: string
          platform?: string | null
        }
        Update: {
          clicked_at?: string
          code?: string
          id?: string
          platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_clicks_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["code"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_images: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          position: number
          r2_key: string
          source_visit_id: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          position?: number
          r2_key: string
          source_visit_id?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          position?: number
          r2_key?: string
          source_visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_images_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_images_source_visit_id_fkey"
            columns: ["source_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          board_id: string | null
          board_item_id: string | null
          created_at: string
          digest_place_ids: string[] | null
          digest_review_count: number | null
          id: string
          is_read: boolean
          recipient_id: string
          travel_book_id: string | null
          travel_book_item_id: string | null
          type: string
          visit_id: string | null
        }
        Insert: {
          actor_id?: string | null
          board_id?: string | null
          board_item_id?: string | null
          created_at?: string
          digest_place_ids?: string[] | null
          digest_review_count?: number | null
          id?: string
          is_read?: boolean
          recipient_id: string
          travel_book_id?: string | null
          travel_book_item_id?: string | null
          type: string
          visit_id?: string | null
        }
        Update: {
          actor_id?: string | null
          board_id?: string | null
          board_item_id?: string | null
          created_at?: string
          digest_place_ids?: string[] | null
          digest_review_count?: number | null
          id?: string
          is_read?: boolean
          recipient_id?: string
          travel_book_id?: string | null
          travel_book_item_id?: string | null
          type?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_travel_book_item_id_fkey"
            columns: ["travel_book_item_id"]
            isOneToOne: false
            referencedRelation: "travel_book_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          draft_visit_id: string | null
          height: number | null
          id: string
          position: number
          r2_key: string
          thumb_r2_key: string | null
          visit_id: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          draft_visit_id?: string | null
          height?: number | null
          id?: string
          position?: number
          r2_key: string
          thumb_r2_key?: string | null
          visit_id?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          draft_visit_id?: string | null
          height?: number | null
          id?: string
          position?: number
          r2_key?: string
          thumb_r2_key?: string | null
          visit_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_draft_visit_id_fkey"
            columns: ["draft_visit_id"]
            isOneToOne: false
            referencedRelation: "draft_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          boundary_geojson: string | null
          boundary_geometry: unknown
          cached_at: string
          category: string | null
          geog: unknown
          google_place_id: string | null
          id: string
          lat: number | null
          level: string
          lng: number | null
          name: string
          osm_id: string | null
          parent_id: string | null
          source: string
        }
        Insert: {
          boundary_geojson?: string | null
          boundary_geometry?: unknown
          cached_at?: string
          category?: string | null
          geog?: unknown
          google_place_id?: string | null
          id?: string
          lat?: number | null
          level: string
          lng?: number | null
          name: string
          osm_id?: string | null
          parent_id?: string | null
          source: string
        }
        Update: {
          boundary_geojson?: string | null
          boundary_geometry?: unknown
          cached_at?: string
          category?: string | null
          geog?: unknown
          google_place_id?: string | null
          id?: string
          lat?: number | null
          level?: string
          lng?: number | null
          name?: string
          osm_id?: string | null
          parent_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompt_attachments: {
        Row: {
          attachment_type: string
          board_id: string | null
          cover_photo_id: string | null
          created_at: string
          display_mode: string | null
          grid_photo_ids: string[] | null
          id: string
          photo_r2_key: string | null
          place_id: string | null
          position: number
          prompt_id: string
          show_note: boolean
          show_rating_stamp: boolean
          text_value: string | null
          travel_book_id: string | null
          visit_id: string | null
          visit_photo_id: string | null
        }
        Insert: {
          attachment_type: string
          board_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          display_mode?: string | null
          grid_photo_ids?: string[] | null
          id?: string
          photo_r2_key?: string | null
          place_id?: string | null
          position?: number
          prompt_id: string
          show_note?: boolean
          show_rating_stamp?: boolean
          text_value?: string | null
          travel_book_id?: string | null
          visit_id?: string | null
          visit_photo_id?: string | null
        }
        Update: {
          attachment_type?: string
          board_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          display_mode?: string | null
          grid_photo_ids?: string[] | null
          id?: string
          photo_r2_key?: string | null
          place_id?: string | null
          position?: number
          prompt_id?: string
          show_note?: boolean
          show_rating_stamp?: boolean
          text_value?: string | null
          travel_book_id?: string | null
          visit_id?: string | null
          visit_photo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompt_attachments_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "profile_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_visit_photo_id_fkey"
            columns: ["visit_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompts: {
        Row: {
          created_at: string
          id: string
          position: number
          prompt_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          prompt_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          prompt_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          snapshot_author_name: string | null
          snapshot_note: string | null
          snapshot_place_name: string | null
          snapshot_rating: number | null
          status: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          snapshot_author_name?: string | null
          snapshot_note?: string | null
          snapshot_place_name?: string | null
          snapshot_rating?: number | null
          status?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          snapshot_author_name?: string | null
          snapshot_note?: string | null
          snapshot_place_name?: string | null
          snapshot_rating?: number | null
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_boards: {
        Row: {
          board_id: string
          created_at: string
          notify_on_new_items: boolean
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          notify_on_new_items?: boolean
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          notify_on_new_items?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_boards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_boards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_travel_books: {
        Row: {
          created_at: string
          notify_on_new_items: boolean
          travel_book_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_on_new_items?: boolean
          travel_book_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_on_new_items?: boolean
          travel_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_travel_books_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_travel_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string
          created_at: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      travel_book_collaborators: {
        Row: {
          added_at: string
          travel_book_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          travel_book_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          travel_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_collaborators_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_item_checks: {
        Row: {
          checked_at: string
          travel_book_id: string
          travel_book_item_id: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          travel_book_id: string
          travel_book_item_id: string
          user_id: string
        }
        Update: {
          checked_at?: string
          travel_book_id?: string
          travel_book_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_item_checks_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_item_checks_travel_book_item_id_fkey"
            columns: ["travel_book_item_id"]
            isOneToOne: false
            referencedRelation: "travel_book_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_item_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_items: {
        Row: {
          added_at: string
          added_by: string
          id: string
          item_type: string
          place_id: string | null
          travel_book_id: string
          visit_id: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          id?: string
          item_type?: string
          place_id?: string | null
          travel_book_id: string
          visit_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          item_type?: string
          place_id?: string | null
          travel_book_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_recaps: {
        Row: {
          author_id: string
          body: string | null
          cover_r2_key: string | null
          created_at: string
          id: string
          is_published: boolean
          published_at: string | null
          rating: number | null
          title: string
          travel_book_id: string
        }
        Insert: {
          author_id: string
          body?: string | null
          cover_r2_key?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating?: number | null
          title: string
          travel_book_id: string
        }
        Update: {
          author_id?: string
          body?: string | null
          cover_r2_key?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating?: number | null
          title?: string
          travel_book_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_recaps_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_recaps_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_books: {
        Row: {
          cover_photo_id: string | null
          cover_photo_r2_key: string | null
          cover_r2_key: string | null
          created_at: string
          description: string | null
          id: string
          is_private: boolean
          location_place_id: string | null
          rating: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          location_place_id?: string | null
          rating?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          location_place_id?: string | null
          rating?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_books_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_books_location_place_id_fkey"
            columns: ["location_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_excluded_visits: {
        Row: {
          created_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_excluded_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_excluded_visits_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_overrides: {
        Row: {
          dismissed: boolean
          display_place_id: string | null
          home_prompt_dismissed: boolean
          manual_end_date: string | null
          promoted: boolean
          start_date: string
          travel_book_id: string | null
          trip_prompt_declined: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          dismissed?: boolean
          display_place_id?: string | null
          home_prompt_dismissed?: boolean
          manual_end_date?: string | null
          promoted?: boolean
          start_date: string
          travel_book_id?: string | null
          trip_prompt_declined?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          dismissed?: boolean
          display_place_id?: string | null
          home_prompt_dismissed?: boolean
          manual_end_date?: string | null
          promoted?: boolean
          start_date?: string
          travel_book_id?: string | null
          trip_prompt_declined?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_overrides_display_place_id_fkey"
            columns: ["display_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_overrides_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_r2_key: string | null
          ban_reason: string | null
          banned_at: string | null
          bio: string | null
          birthdate: string | null
          created_at: string
          discoverable_by_contacts: boolean
          feed_last_viewed_at: string | null
          handle: string | null
          has_set_demographics: boolean
          has_set_privacy: boolean
          has_shared_invite: boolean
          hashed_phone: string | null
          home_place_id: string | null
          id: string
          invite_attributed_at: string | null
          invite_exempt: boolean
          invited_by: string | null
          invited_via_code: string | null
          is_admin: boolean
          is_private: boolean
          last_friend_digest_at: string
          last_nearby_digest_at: string
          map_default_center_lat: number | null
          map_default_center_lng: number | null
          map_default_layers: string[]
          map_default_zoom: number | null
          name: string | null
          notify_comments: boolean
          notify_follows: boolean
          notify_friend_activity: boolean
          notify_friend_digest: boolean
          notify_likes: boolean
          notify_nearby_reviews: boolean
          notify_saves: boolean
          notify_tags: boolean
          profile_section_order: string[] | null
          show_map: boolean
          terms_accepted_at: string | null
          terms_version: string | null
        }
        Insert: {
          avatar_r2_key?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          discoverable_by_contacts?: boolean
          feed_last_viewed_at?: string | null
          handle?: string | null
          has_set_demographics?: boolean
          has_set_privacy?: boolean
          has_shared_invite?: boolean
          hashed_phone?: string | null
          home_place_id?: string | null
          id: string
          invite_attributed_at?: string | null
          invite_exempt?: boolean
          invited_by?: string | null
          invited_via_code?: string | null
          is_admin?: boolean
          is_private?: boolean
          last_friend_digest_at?: string
          last_nearby_digest_at?: string
          map_default_center_lat?: number | null
          map_default_center_lng?: number | null
          map_default_layers?: string[]
          map_default_zoom?: number | null
          name?: string | null
          notify_comments?: boolean
          notify_follows?: boolean
          notify_friend_activity?: boolean
          notify_friend_digest?: boolean
          notify_likes?: boolean
          notify_nearby_reviews?: boolean
          notify_saves?: boolean
          notify_tags?: boolean
          profile_section_order?: string[] | null
          show_map?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Update: {
          avatar_r2_key?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          discoverable_by_contacts?: boolean
          feed_last_viewed_at?: string | null
          handle?: string | null
          has_set_demographics?: boolean
          has_set_privacy?: boolean
          has_shared_invite?: boolean
          hashed_phone?: string | null
          home_place_id?: string | null
          id?: string
          invite_attributed_at?: string | null
          invite_exempt?: boolean
          invited_by?: string | null
          invited_via_code?: string | null
          is_admin?: boolean
          is_private?: boolean
          last_friend_digest_at?: string
          last_nearby_digest_at?: string
          map_default_center_lat?: number | null
          map_default_center_lng?: number | null
          map_default_layers?: string[]
          map_default_zoom?: number | null
          name?: string | null
          notify_comments?: boolean
          notify_follows?: boolean
          notify_friend_activity?: boolean
          notify_friend_digest?: boolean
          notify_likes?: boolean
          notify_nearby_reviews?: boolean
          notify_saves?: boolean
          notify_tags?: boolean
          profile_section_order?: string[] | null
          show_map?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_home_place_id_fkey"
            columns: ["home_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_invited_via_code_fkey"
            columns: ["invited_via_code"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["code"]
          },
        ]
      }
      visit_tagged_places: {
        Row: {
          place_id: string
          visit_id: string
        }
        Insert: {
          place_id: string
          visit_id: string
        }
        Update: {
          place_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tagged_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tagged_places_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_tagged_users: {
        Row: {
          created_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tagged_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tagged_users_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_tags: {
        Row: {
          created_at: string
          tag_slug: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          tag_slug: string
          visit_id: string
        }
        Update: {
          created_at?: string
          tag_slug?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tags_tag_slug_fkey"
            columns: ["tag_slug"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "visit_tags_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          card_grain: number | null
          card_orientation: string | null
          card_side: string | null
          card_stamp: string | null
          card_stock: number | null
          created_at: string
          id: string
          note: string | null
          place_id: string
          rating: number | null
          user_id: string
          visited_on: string
        }
        Insert: {
          card_grain?: number | null
          card_orientation?: string | null
          card_side?: string | null
          card_stamp?: string | null
          card_stock?: number | null
          created_at?: string
          id?: string
          note?: string | null
          place_id: string
          rating?: number | null
          user_id: string
          visited_on: string
        }
        Update: {
          card_grain?: number | null
          card_orientation?: string | null
          card_side?: string | null
          card_stamp?: string | null
          card_stock?: number | null
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string
          rating?: number | null
          user_id?: string
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      area_rating_shrinkage_k: { Args: never; Returns: number }
      can_view_user_content: {
        Args: { owner_id: string; viewer_id: string }
        Returns: boolean
      }
      deepest_common_area: { Args: { p_ids: string[] }; Returns: string }
      drain_harmony_refresh_queue: {
        Args: { batch_limit?: number }
        Returns: number
      }
      ensure_invite_code: { Args: never; Returns: string }
      flag_self_underage: { Args: never; Returns: undefined }
      generate_invite_code: { Args: never; Returns: string }
      get_collection_stats: {
        Args: { board_ids?: string[]; travel_book_ids?: string[] }
        Returns: {
          avg_rating: number
          collection_id: string
          collection_type: string
          save_count: number
        }[]
      }
      get_harmony: {
        Args: { other_id: string; viewer_id: string }
        Returns: {
          evidence: number
          score: number
          shared_areas: number
          shared_destinations: number
          shared_local: number
          shared_places: number
        }[]
      }
      get_harmony_breakdown: {
        Args: { max_rows?: number; other_id: string; viewer_id: string }
        Returns: {
          agreement: number
          is_local: boolean
          kind: string
          my_rating: number
          name: string
          photo_id: string
          place_id: string
          their_rating: number
        }[]
      }
      get_nearby_reviewed_places: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
        }
        Returns: {
          avg_rating: number
          lat: number
          lng: number
          name: string
          place_id: string
          review_count: number
        }[]
      }
      get_place_aggregate_rating: {
        Args: { target_place_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
      get_place_ancestry: {
        Args: { p_id: string }
        Returns: {
          depth: number
          id: string
          level: string
          name: string
        }[]
      }
      get_place_descendant_ids: {
        Args: { target_place_id: string }
        Returns: {
          depth: number
          place_id: string
        }[]
      }
      get_popular_places: {
        Args: { result_limit?: number }
        Returns: {
          avg_rating: number
          lat: number
          lng: number
          name: string
          place_id: string
          review_count: number
        }[]
      }
      get_top_matches: {
        Args: { result_limit?: number; uid: string }
        Returns: {
          avatar_r2_key: string
          evidence: number
          handle: string
          name: string
          score: number
          shared_destinations: number
          user_id: string
        }[]
      }
      get_trip_suggestion: {
        Args: { target_date: string; target_user_id: string }
        Returns: {
          area_name: string
          area_place_id: string
          distance_from_home_m: number
          visit_count: number
        }[]
      }
      get_trips_for_users: {
        Args: { user_ids: string[] }
        Returns: {
          area_lat: number
          area_level: string
          area_lng: number
          area_name: string
          area_place_id: string
          auto_area_place_id: string
          end_date: string
          is_ongoing: boolean
          kind: string
          start_date: string
          travel_book_id: string
          trip_key: string
          user_id: string
          visit_ids: string[]
        }[]
      }
      get_visit_range_for_place: {
        Args: { target_place_id: string; target_user_id: string }
        Returns: {
          end_date: string
          start_date: string
          visit_count: number
        }[]
      }
      get_visited_regions: {
        Args: { profile_user_id: string }
        Returns: {
          boundary_geojson: string
          id: string
          level: string
          name: string
        }[]
      }
      is_banned: { Args: { p_user_id: string }; Returns: boolean }
      is_blocked: { Args: { user_a: string; user_b: string }; Returns: boolean }
      is_home_place: { Args: { pid: string; uid: string }; Returns: boolean }
      is_travel_book_participant: {
        Args: { book_id: string; uid: string }
        Returns: boolean
      }
      majority_area: { Args: { p_ids: string[] }; Returns: string }
      match_contacts_by_hash: {
        Args: { hashes: string[] }
        Returns: {
          handle: string
          hashed_phone: string
          id: string
          is_private: boolean
          name: string
        }[]
      }
      place_has_ancestor: {
        Args: { anc_id: string; p_id: string }
        Returns: boolean
      }
      publish_draft: { Args: { draft_id: string }; Returns: string }
      rating_recency_weight: { Args: { rated_on: string }; Returns: number }
      record_invite_click: {
        Args: { p_code: string; p_platform?: string }
        Returns: undefined
      }
      redeem_invite: { Args: { p_code: string }; Returns: boolean }
      refresh_harmony_for_user: { Args: { uid: string }; Returns: number }
      resolve_invite: {
        Args: { p_code: string }
        Returns: {
          handle: string
          name: string
        }[]
      }
      resolve_state_countries: {
        Args: { place_ids: string[] }
        Returns: {
          country_name: string
          place_id: string
          state_name: string
        }[]
      }
      run_friend_review_digest: { Args: never; Returns: undefined }
      run_nearby_review_digest: { Args: never; Returns: undefined }
      set_user_banned: {
        Args: { p_reason: string; p_user_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_place_boundary: {
        Args: { geojson: Json; place_id: string }
        Returns: undefined
      }
      upgrade_place_details: {
        Args: {
          p_category: string
          p_google_place_id: string
          p_lat: number
          p_lng: number
          place_id: string
        }
        Returns: {
          boundary_geojson: string | null
          boundary_geometry: unknown
          cached_at: string
          category: string | null
          geog: unknown
          google_place_id: string | null
          id: string
          lat: number | null
          level: string
          lng: number | null
          name: string
          osm_id: string | null
          parent_id: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "places"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_area_ratings: {
        Args: { uid: string }
        Returns: {
          area_id: string
          has_explicit: boolean
          rating: number
          sample_size: number
        }[]
      }
      user_away_areas: {
        Args: { uid: string }
        Returns: {
          area_id: string
          weight: number
        }[]
      }
      user_away_places: {
        Args: { uid: string }
        Returns: {
          place_id: string
          rating: number
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
