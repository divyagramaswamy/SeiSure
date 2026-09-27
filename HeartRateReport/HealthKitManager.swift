//
//  HealthKitManager.swift
//  HeartRateReport
//
//  Created by divya on 9/27/26.
//

import Foundation
import HealthKit
import Combine

@MainActor
final class HealthKitManager: ObservableObject {
    @Published var heartRate: Double?
    @Published var sampleDate: Date?
    @Published var status = "Waiting for HealthKit"

    private let healthStore = HKHealthStore()

    // IMPORTANT: keep npm run dev running on your Mac.
    // If your Vite "Network:" IP changes, update this URL.
    private let serverURL =
        URL(string: "http://10.2.51.3:5173/api/heart-rate")!

    private var observerQuery: HKObserverQuery?

    func start() {
        guard HKHealthStore.isHealthDataAvailable() else {
            status = "HealthKit unavailable"
            return
        }

        requestAuthorization()
    }

    private func requestAuthorization() {
        guard let heartRateType =
            HKQuantityType.quantityType(forIdentifier: .heartRate)
        else {
            status = "Heart-rate type unavailable"
            return
        }

        healthStore.requestAuthorization(
            toShare: [],
            read: [heartRateType]
        ) { [weak self] success, error in
            guard let self else { return }

            Task { @MainActor in
                if let error {
                    self.status =
                        "Authorization error: \(error.localizedDescription)"
                    return
                }

                guard success else {
                    self.status = "HealthKit authorization failed"
                    return
                }

                self.status = "HealthKit connected"

                self.fetchLatestHeartRate()
                self.startHeartRateObserver()
                self.enableBackgroundDelivery()
            }
        }
    }

    func fetchLatestHeartRate(
        completion: (() -> Void)? = nil
    ) {
        guard let heartRateType =
            HKQuantityType.quantityType(forIdentifier: .heartRate)
        else {
            completion?()
            return
        }

        let sortDescriptor =
            NSSortDescriptor(
                key: HKSampleSortIdentifierStartDate,
                ascending: false
            )

        let query = HKSampleQuery(
            sampleType: heartRateType,
            predicate: nil,
            limit: 1,
            sortDescriptors: [sortDescriptor]
        ) { [weak self] _, samples, error in
            defer { completion?() }

            guard let self else { return }

            if let error {
                Task { @MainActor in
                    self.status =
                        "Read error: \(error.localizedDescription)"
                }
                return
            }

            guard let sample =
                samples?.first as? HKQuantitySample
            else {
                Task { @MainActor in
                    self.status = "No heart-rate samples found"
                }
                return
            }

            let unit =
                HKUnit.count().unitDivided(by: .minute())

            let bpm =
                sample.quantity.doubleValue(for: unit)

            Task { @MainActor in
                self.heartRate = bpm
                self.sampleDate = sample.startDate
                self.status = "Heart rate updated"

                self.sendToServer(
                    bpm: bpm,
                    date: sample.startDate
                )
            }
        }

        healthStore.execute(query)
    }

    private func startHeartRateObserver() {
        guard let heartRateType =
            HKQuantityType.quantityType(forIdentifier: .heartRate)
        else {
            return
        }

        if let observerQuery {
            healthStore.stop(observerQuery)
        }

        let query = HKObserverQuery(
            sampleType: heartRateType,
            predicate: nil
        ) { [weak self] _, completionHandler, error in
            guard let self else {
                completionHandler()
                return
            }

            if let error {
                print("HealthKit observer error:", error)
                completionHandler()
                return
            }

            self.fetchLatestHeartRate {
                completionHandler()
            }
        }

        observerQuery = query
        healthStore.execute(query)
    }

    private func enableBackgroundDelivery() {
        guard let heartRateType =
            HKQuantityType.quantityType(forIdentifier: .heartRate)
        else {
            return
        }

        healthStore.enableBackgroundDelivery(
            for: heartRateType,
            frequency: .immediate
        ) { success, error in
            if let error {
                print("Background delivery error:", error)
                return
            }

            print("Background delivery enabled:", success)
        }
    }

    private func sendToServer(
        bpm: Double,
        date: Date
    ) {
        var request = URLRequest(url: serverURL)
        request.httpMethod = "POST"

        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )

        let formatter = ISO8601DateFormatter()

        let payload: [String: Any] = [
            "heartRate": bpm,
            "timestamp": formatter.string(from: date),
            "source": "Apple HealthKit"
        ]

        do {
            request.httpBody =
                try JSONSerialization.data(
                    withJSONObject: payload
                )
        } catch {
            print("JSON error:", error)
            return
        }

        URLSession.shared.dataTask(with: request) {
            data,
            response,
            error in

            if let error {
                print("POST failed:", error)
                return
            }

            if let httpResponse =
                response as? HTTPURLResponse {
                print("POST status:", httpResponse.statusCode)
            }

            if let data,
               let body = String(
                    data: data,
                    encoding: .utf8
               ) {
                print("Server:", body)
            }
        }
        .resume()
    }
}
