import SwiftUI

struct ContentView: View {
    @StateObject private var healthKit =
        HealthKitManager()

    var body: some View {
        VStack(spacing: 24) {
            Text("Heart Rate Report")
                .font(.largeTitle)
                .bold()

            Text("HealthKit Bridge")
                .foregroundStyle(.secondary)

            if let heartRate = healthKit.heartRate {
                Text("\(Int(heartRate))")
                    .font(.system(size: 64, weight: .bold))

                Text("BPM")
                    .foregroundStyle(.secondary)
            } else {
                Text("Waiting for heart rate…")
            }

            Text(healthKit.status)
                .font(.caption)
                .foregroundStyle(.secondary)

            if let date = healthKit.sampleDate {
                Text("Sample: \(date.formatted())")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button("Refresh from HealthKit") {
                healthKit.fetchLatestHeartRate()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .task {
            healthKit.start()
        }
    }
}
