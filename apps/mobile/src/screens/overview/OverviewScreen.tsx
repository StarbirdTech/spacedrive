import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import { SDMobileCore } from "sd-mobile-core";
import { useNormalizedQuery, useMobileClient } from "../../client";
import type { Library, Device } from "@sd/ts-client";
import { HeroStats, DevicePanel, ActionButtons } from "./components";
import { PairingPanel } from "../../components/PairingPanel";
import { LibrarySwitcherPanel } from "../../components/LibrarySwitcherPanel";

export function OverviewScreen() {
	const insets = useSafeAreaInsets();
	const navigation = useNavigation();
	const client = useMobileClient();
	const [showPairing, setShowPairing] = useState(false);
	const [showLibrarySwitcher, setShowLibrarySwitcher] = useState(false);
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		null
	);
	const [isAddingStorage, setIsAddingStorage] = useState(false);

	// Fetch library info with real-time statistics updates
	const {
		data: libraryInfo,
		isLoading,
		error,
	} = useNormalizedQuery<null, Library>({
		wireMethod: "query:libraries.info",
		input: null,
		resourceType: "library",
	});

	// Fetch locations list to get the selected location reactively
	const { data: locationsData } = useNormalizedQuery<any, any>({
		wireMethod: "query:locations.list",
		input: null,
		resourceType: "location",
	});

	// Fetch devices to get current device slug
	const { data: devicesData, error: devicesError } = useNormalizedQuery<any, Device[]>({
		wireMethod: "query:devices.list",
		input: { include_offline: true, include_details: false },
		resourceType: "device",
	});

	// Get the current device
	const currentDevice = useMemo(() => {
		if (!devicesData) {
			console.log("[OverviewScreen] No devicesData yet");
			return null;
		}
		console.log("[OverviewScreen] devicesData:", JSON.stringify(devicesData).slice(0, 500));
		const devices = Array.isArray(devicesData) ? devicesData : (devicesData as any).devices;
		if (!devices) {
			console.log("[OverviewScreen] No devices array found");
			return null;
		}
		const current = devices.find((d: Device) => d.is_current);
		console.log("[OverviewScreen] Current device:", current?.name, current?.slug);
		return current || null;
	}, [devicesData]);

	// Find the selected location from the list reactively
	const selectedLocation = useMemo(() => {
		if (!selectedLocationId || !locationsData?.locations) return null;
		return (
			locationsData.locations.find(
				(loc: any) => loc.id === selectedLocationId
			) || null
		);
	}, [selectedLocationId, locationsData]);

	const openDrawer = () => {
		navigation.dispatch(DrawerActions.openDrawer());
	};

	// Handle adding storage location
	const handleAddStorage = useCallback(async () => {
		if (!currentDevice) {
			const errorMsg = devicesError
				? `Device query failed: ${devicesError}`
				: "Device information not loaded yet. Please wait a moment and try again.";
			Alert.alert("Error", errorMsg);
			console.log("[handleAddStorage] No current device. Error:", devicesError);
			return;
		}

		if (isAddingStorage) return;

		try {
			setIsAddingStorage(true);

			if (Platform.OS === "android") {
				// Use native SAF folder picker for Android
				console.log("[handleAddStorage] Opening Android folder picker...");
				const result = await SDMobileCore.pickFolder();
				console.log("[handleAddStorage] Folder picker result:", result);

				if (!result.path) {
					Alert.alert(
						"Cannot Access Folder",
						"The selected folder cannot be accessed directly. This may be due to Android storage restrictions.\n\nPlease try selecting a folder from internal storage (not an SD card or cloud storage).",
						[{ text: "OK" }]
					);
					return;
				}

				// Add the location with the real filesystem path
				await client.libraryAction("locations.add", {
					path: {
						Physical: {
							device_slug: currentDevice.slug,
							path: result.path,
						},
					},
					name: result.name,
					mode: "Deep",
					job_policies: null,
				});

				Alert.alert("Success", `Added "${result.name}" to your library! Indexing will begin shortly.`);
			} else {
				// iOS - use expo-document-picker
				const result = await DocumentPicker.getDocumentAsync({
					type: "*/*",
					copyToCacheDirectory: false,
				});

				if (result.canceled || !result.assets || result.assets.length === 0) {
					return;
				}

				const selectedUri = result.assets[0].uri;

				await client.libraryAction("locations.add", {
					path: {
						Physical: {
							device_slug: currentDevice.slug,
							path: selectedUri,
						},
					},
					name: null,
					mode: "Deep",
					job_policies: null,
				});

				Alert.alert("Success", "Storage location added! Indexing will begin shortly.");
			}
		} catch (err: any) {
			console.error("Failed to add storage:", err);
			// Handle cancellation gracefully
			if (err?.code === "CANCELLED" || err?.message?.includes("cancel")) {
				return;
			}
			Alert.alert("Error", `Failed to add storage: ${err?.message || err}`);
		} finally {
			setIsAddingStorage(false);
		}
	}, [client, currentDevice, isAddingStorage, devicesError]);

	if (isLoading || !libraryInfo) {
		return (
			<ScrollView
				className="flex-1 bg-app"
				contentContainerStyle={{
					paddingBottom: insets.bottom + 100,
					paddingHorizontal: 16,
				}}
			>
				<View className="items-center justify-center py-12">
					<Text className="text-ink-dull">
						Loading library statistics...
					</Text>
				</View>
			</ScrollView>
		);
	}

	if (error) {
		return (
			<ScrollView
				className="flex-1 bg-app"
				contentContainerStyle={{
					paddingBottom: insets.bottom + 100,
					paddingHorizontal: 16,
				}}
			>
				<View className="items-center justify-center py-12">
					<Text className="text-red-500 font-semibold">Error</Text>
					<Text className="text-ink-dull mt-2">{String(error)}</Text>
				</View>
			</ScrollView>
		);
	}

	const stats = libraryInfo.statistics;

	return (
		<ScrollView
			className="flex-1 bg-app"
			contentContainerStyle={{
				paddingTop: insets.top + 16,
				paddingBottom: insets.bottom + 100,
			}}
		>
			{/* Hero Stats */}
			<HeroStats
				totalStorage={stats.total_capacity}
				usedStorage={stats.total_capacity - stats.available_capacity}
				totalFiles={Number(stats.total_files)}
				locationCount={stats.location_count}
				tagCount={stats.tag_count}
				deviceCount={stats.device_count}
				uniqueContentCount={Number(stats.unique_content_count)}
			/>

			{/* Device Panel */}
			<View className="px-4">
				<DevicePanel
					onLocationSelect={(location) =>
						setSelectedLocationId(location?.id || null)
					}
				/>
			</View>

			{/* Action Buttons */}
			<View className="px-4">
				<ActionButtons
					onPairDevice={() => setShowPairing(true)}
					onSetupSync={() => {/* TODO: Open sync setup */}}
					onAddStorage={handleAddStorage}
				/>
			</View>

			{/* Pairing Panel */}
			<PairingPanel
				isOpen={showPairing}
				onClose={() => setShowPairing(false)}
			/>

			{/* Library Switcher Panel */}
			<LibrarySwitcherPanel
				isOpen={showLibrarySwitcher}
				onClose={() => setShowLibrarySwitcher(false)}
			/>
		</ScrollView>
	);
}
