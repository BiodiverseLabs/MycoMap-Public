import { ObservationValidation } from "@/components/admin/ObservationValidation";

export default function AdminValidation() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Data Validation
          </h1>
          <p className="text-slate-600">
            Validate and sync observation data with external sources
          </p>
        </div>

        <ObservationValidation />
      </div>
    </div>
  );
}