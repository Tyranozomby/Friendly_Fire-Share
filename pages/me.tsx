import styles from '@/styles/Me.module.css';
import Head from "next/head";
import React, {useState} from "react";
import {Card, Checkbox, Table, Text} from "@nextui-org/react";
import {useSession} from "next-auth/react";
import {GetServerSidePropsContext} from "next";
import {Session} from "next-auth";
import {prisma} from "../lib/db";
import getServerSession from "../lib/customSession";
import {steam_web} from "../lib/steam_web";
import createSteamUser from "../lib/customSteamUser";
import {SteamPlayerSummary} from "steamwebapi-ts/lib/types/SteamPlayerSummary";


type ShareInfo = {
    computer: string | null,
    lastUse: string | null,
    enabled: boolean
}

type BorrowingUser = {
    name: string,
    avatar_url: string,
    profile_url: string,
}

type ShareArray = (ShareInfo & BorrowingUser)[]

export default function Me({sharesProp}: { sharesProp: ShareArray }) {

    const {data: session} = useSession() as unknown as { data: Session };

    const [shares, setShares] = useState<ShareArray>(sharesProp);

    const toggleShare = (index: number) => {
        let newShares = [...shares];
        newShares[index].enabled = !newShares[index].enabled;
        setShares(newShares);
    };

    return (
        <div className={styles.container}>
            <Card variant={"bordered"} style={{width: "fit-content"}}>
                <Card.Footer
                    isBlurred
                    css={{
                        position: "absolute",
                        bgBlur: "#ffffff66",
                        borderTop: "$borderWeights$light solid rgba(255, 255, 255, 0.2)",
                        bottom: 0,
                        zIndex: 1,
                        height: "20%",
                        padding: "0"
                    }}
                >
                    <Text h4 style={{margin: "auto", paddingBottom: "4px"}}>
                        {session.user.name}
                    </Text>
                </Card.Footer>
                <Card.Body style={{padding: 0}}>
                    <Card.Image
                        src={session.user.profile_picture_url}
                        objectFit="cover"
                        width="200px"
                    />
                </Card.Body>

            </Card>
            <Head>
                <title>Me - Friendly Fire-Share</title>
            </Head>
            <main className={styles.main}>
                <Text h1>
                    {session.user.name}
                </Text>
                <div className={styles.container}>
                    <Table className={styles.table} aria-label="Shares list">
                        <Table.Header>
                            <Table.Column>Name</Table.Column>
                            <Table.Column>Computer</Table.Column>
                            <Table.Column>Last use</Table.Column>
                            <Table.Column>Enabled</Table.Column>
                        </Table.Header>
                        <Table.Body>
                            {shares.map((share, index) => (
                                <Table.Row key={index}>
                                    <Table.Cell>{share.name}</Table.Cell>
                                    <Table.Cell>{share.computer}</Table.Cell>
                                    <Table.Cell>{share.lastUse}</Table.Cell>
                                    <Table.Cell>
                                        <Checkbox aria-label="Control share state"
                                                  isSelected={share.enabled}
                                                  isRounded={false}
                                                  onChange={() => toggleShare(index)}/>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            </main>
        </div>
    );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {

    let session = await getServerSession(context);
    let server_user = await prisma.user.findUniqueOrThrow({
        where: {
            id: session.user.steam_id
        },
        include: {
            Borrowers: true
        }
    });
    console.log(JSON.stringify(server_user));

    let devices: { [steam_id: string]: any } = {};

    if (server_user.RefreshToken != null) {
        let steam_client = await createSteamUser(server_user.RefreshToken);
        console.log("Steam client logged in");
        let the_devices = (await steam_client.getAuthorizedSharingDevices()).devices;
        console.log(JSON.stringify(the_devices));
        devices = the_devices.reduce((obj, item) => {

                if (item?.lastBorrower) {
                    return {...obj, [item.lastBorrower.getSteamID64()]: item};
                } else
                    return obj;
            }
            , {});
        steam_client.logOff();
    }


    // list.reduce((obj, item) => ({...obj, [item.name]: item.value}), {})

    let steam_profiles: SteamPlayerSummary[] = server_user.Borrowers.length > 0 ?
        (await steam_web.getPlayersSummary(server_user.Borrowers.map(b => b.id))) : [];

    const shares = steam_profiles.map(profile => {
        let steam_id = profile.steamid;
        let user_info: BorrowingUser = {
            name: profile.personaname,
            avatar_url: profile.avatarfull,
            profile_url: profile.profileurl
        };

        let share_info: ShareInfo | {};
        if (devices[steam_id]) {
            let device = devices[steam_id];
            share_info = {
                lastUse: device.lastTimeUsed,
                computer: device.deviceName,
                enabled: device.isCanceled
            };
        } else {
            share_info = {
                lastUse: null,
                computer: null,
                enabled: false
            };
        }
        return {...user_info, ...share_info};
    });

    return {
        props: {
            sharesProp: shares,
            session: session
        }
    };
}